import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";

import { capabilitiesFor } from "./capabilities";
import { buildMessages as buildPromptMessages, type PromptLayout } from "../interview";
import { normalizeUsage } from "../usage";
import type {
  AiConfig,
  ChatRequest,
  DocumentBlock,
  ModelInfo,
  ProviderAdapter,
  ProviderAuth,
  ProviderId,
  StructuredRequest,
  StructuredResult,
  TextDelta,
  TurnResult,
  TurnStream,
  UploadedFile,
} from "./types";

/**
 * Adapter Anthropic — T-0b.4.
 *
 * Điểm không được sai ở đây (sai là 400), xem docs/02-DESIGN.md §12.1:
 *   - Model ID `claude-opus-5`, không thêm hậu tố ngày.
 *   - `thinking: {type: "adaptive"}`. `budget_tokens` đã bị gỡ.
 *   - `temperature`/`top_p`/`top_k` đã bị gỡ — dùng `output_config.effort`.
 *   - `effort` nằm BÊN TRONG `output_config`, và không có giá trị `off`.
 *   - Không dùng assistant prefill.
 *   - Files API đã ra khỏi beta: `client.files.*`, không beta header.
 *
 * Các tên trường dưới đây đã đối chiếu với `node_modules/@anthropic-ai/sdk`
 * (0.135.0) chứ không viết theo trí nhớ.
 */

const ID: ProviderId = "anthropic";

/** `output_config.effort` không có giá trị `off` — tắt suy luận bằng cách không gửi. */
type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

function toAnthropicEffort(level: ChatRequest["reasoning"]) {
  if (level === "off") return null;
  return level as AnthropicEffort;
}

function supportedEffort(req: ChatRequest | StructuredRequest) {
  const effort = toAnthropicEffort(req.reasoning);
  return effort && capabilitiesFor(ID, req.model).reasoningLevels.includes(req.reasoning)
    ? effort
    : null;
}

/**
 * Dựng client với `apiKey` tường minh.
 *
 * Không để SDK đọc `process.env.ANTHROPIC_API_KEY`: nếu adapter đọc env, một người
 * quên dán key sẽ âm thầm dùng key của chủ dự án — request thành công, họ không biết.
 * Xem docs/02-DESIGN.md §2.1.
 */
function createClient(auth: ProviderAuth): Anthropic {
  return new Anthropic({ apiKey: auth.apiKey });
}

function toDocumentBlock(block: DocumentBlock) {
  if (block.kind === "text") {
    return { type: "text" as const, text: block.text ?? "" };
  }
  return {
    type: "document" as const,
    source: { type: "file" as const, file_id: block.fileId ?? "" },
  };
}

/**
 * Dịch bố cục logic của `lib/interview.ts` sang đúng hình dạng messages của Anthropic.
 *
 * Khối `assistant` phải phát lại **nguyên vẹn** — kể cả khối thinking. Dựng lại
 * lịch sử từ text sẽ khiến mọi lượt viết lại toàn bộ cache; request vẫn thành công,
 * chỉ là hoá đơn tăng gấp rồi. Xem docs/02-DESIGN.md §4.5.
 */
function encodeMessages(layout: PromptLayout): Anthropic.MessageParam[] {
  return layout.messages.map((message): Anthropic.MessageParam => {
    if (message.role === "assistant") {
      return { role: "assistant", content: message.blocks as Anthropic.ContentBlockParam[] };
    }
    if (message.role === "system") return { role: "system", content: message.text };
    return { role: "user", content: message.content.map(toDocumentBlock) };
  });
}

function mapStopReason(
  stopReason: string | null | undefined,
): TurnResult["stopReason"] {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function toTurnResult(message: Anthropic.Message): TurnResult {
  // Kiểm tra điều kiện dừng trước khi đọc nội dung: một phản hồi từ chối không có
  // text để hiển thị, và đọc nó trước là cách hay sinh lỗi "không phải một chuỗi".
  const stopReason = mapStopReason(message.stop_reason);

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    // Giữ nguyên cả khối thinking: client gửi lại nguyên vẹn ở lượt sau.
    blocks: message.content as unknown[],
    text: stopReason === "refusal" ? "" : text,
    stopReason,
    usage: normalizeUsage({
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens,
      cacheWrite: message.usage.cache_creation_input_tokens,
    }),
  };
}

/**
 * Bọc luồng của SDK thành `TurnStream` của ứng dụng.
 *
 * `final` resolve sau khi luồng kết thúc; nếu luồng hỏng, `final` reject và trình
 * duyệt giữ phần đã nhận thay vì ghi một lượt dở dang vào transcript.
 */
async function* iterate(
  stream: MessageStream,
): AsyncGenerator<TextDelta> {
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield { text: event.delta.text };
    }
  }
}

function createTurnStream(
  stream: MessageStream,
  final: Promise<TurnResult>,
): TurnStream {
  return {
    [Symbol.asyncIterator]: () => iterate(stream),
    final,
  };
}

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    id: ID,
    capabilities: capabilitiesFor(ID, "claude-opus-5"),

    stream(auth: ProviderAuth, req: ChatRequest): TurnStream {
      const client = createClient(auth);
      const effort = supportedEffort(req);

      // `off` bỏ cả thinking lẫn effort; không có giá trị `effort: "off"`.
      const thinking = effort ? { thinking: { type: "adaptive" as const } } : {};
      const outputConfig = effort ? { output_config: { effort } } : {};

      const layout = buildPromptMessages(req, ID);
      const stream = client.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens,
        // Prompt lõi bất biến ở `system`, kèm điểm ghi cache. Cấu hình phiên đặt
        // thành message `role:"system"` sau lịch sử — xem §5.1.
        system: [
          {
            type: "text",
            text: layout.leadingInstruction,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: encodeMessages(layout),
        // Điểm ghi cache thứ hai: marker cấp cao nhất bám vào khối cacheable
        // cuối cùng của request (đuôi `messages`), nên tiền tố lõi + lịch sử đã
        // có đều được đọc lại. Đối chiếu `MessageCreateParamsBase.cache_control`
        // trong SDK 0.135.0; xem §12.2 về việc còn phải xác minh với API thật.
        cache_control: { type: "ephemeral" },
        ...thinking,
        ...outputConfig,
      });

      const final = stream.finalMessage().then(toTurnResult);
      return createTurnStream(stream, final);
    },

    async structured(
      auth: ProviderAuth,
      req: StructuredRequest,
    ): Promise<StructuredResult> {
      const client = createClient(auth);
      const effort = supportedEffort(req);

      // `structured` bắt buộc phải kết thúc bằng một lượt `user`.
      const layout = buildPromptMessages({ ...req, newTurn: req.instruction }, ID);

      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: [
          {
            type: "text",
            text: layout.leadingInstruction,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: encodeMessages(layout),
        cache_control: { type: "ephemeral" },
        ...(effort ? { thinking: { type: "adaptive" as const } } : {}),
        output_config: {
          ...(effort ? { effort } : {}),
          format: {
            type: "json_schema",
            schema: req.jsonSchema,
          },
        },
      });

      // Không coi một phản hồi từ chối hoặc cắt cụt là báo cáo hợp lệ.
      if (mapStopReason(response.stop_reason) !== "end_turn") {
        throw new Error("Anthropic structured response did not complete");
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      let data: unknown = undefined;
      try {
        data = JSON.parse(text);
      } catch {
        // Parse hỏng là việc của giai đoạn 4 (thử sửa một lần rồi trả 502).
        // `undefined` là tín hiệu trung thực, không phải object rỗng bịa ra.
        data = undefined;
      }

      return {
        data,
        blocks: response.content as unknown[],
        usage: normalizeUsage({
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cacheRead: response.usage.cache_read_input_tokens,
          cacheWrite: response.usage.cache_creation_input_tokens,
        }),
      };
    },

    // Files API đã ra khỏi beta — `client.files.*`, không `client.beta.files`.
    async upload(auth: ProviderAuth, file: Blob): Promise<UploadedFile> {
      const client = createClient(auth);
      const uploaded = await client.files.upload({
        file: await toFile(file, "cv.pdf"),
      });
      return { id: uploaded.id, expiresAt: uploaded.expires_at ?? undefined };
    },

    async deleteFile(auth: ProviderAuth, id: string): Promise<void> {
      const client = createClient(auth);
      await client.files.delete(id);
    },

    async listModels(auth: ProviderAuth, _cfg: AiConfig): Promise<ModelInfo[]> {
      const client = createClient(auth);
      const page = await client.models.list();

      return page.data.map((model) => ({
        id: model.id,
        displayName: model.display_name,
        // Không suy năng lực từ tên model: dữ liệu capabilities của chính API
        // quyết định PDF, JSON schema và những mức effort thật sự hỗ trợ.
        verified: model.capabilities
          ? {
              ...capabilitiesFor(ID, model.id),
              readsPdf: model.capabilities.pdf_input.supported,
              structuredOutput: model.capabilities.structured_outputs.supported,
              reasoning: model.capabilities.thinking.types.adaptive.supported,
              reasoningLevels: (["low", "medium", "high"] as const).filter(
                (level) => model.capabilities!.effort[level].supported,
              ),
            }
          : null,
      }));
    },
  };
}