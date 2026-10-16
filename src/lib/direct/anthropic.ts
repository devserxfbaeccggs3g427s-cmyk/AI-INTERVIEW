import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { buildMessages, type PromptLayout } from "../interview";
import { capabilitiesFor } from "../providers/capabilities";
import type { ChatRequest, ProviderAdapter, ProviderAuth, StructuredRequest, TurnResult } from "../providers/types";
import { normalizeUsage } from "../usage";
import { browserError, browserTurnStream, DirectError, requireBrowserKey } from "./browser-fetch";

const id = "anthropic" as const;

function client(auth: ProviderAuth): Anthropic {
  requireBrowserKey(auth.apiKey, id);
  return new Anthropic({ apiKey: auth.apiKey, dangerouslyAllowBrowser: true });
}

/**
 * Message `role:"system"` phải nằm **đúng chỗ cũ** ở mọi lượt. Đẩy nó xuống cuối
 * lịch sử mỗi lượt sẽ đổi byte trước đuôi transcript và viết lại cache mỗi lượt —
 * request vẫn thành công, chỉ có hoá đơn tăng. Xem docs/02-DESIGN.md §5.1.
 */
function messages(layout: PromptLayout, model: string): Anthropic.MessageParam[] {
  return layout.messages.map((turn) => {
    if (turn.role === "assistant") {
      return { role: "assistant", content: turn.blocks as Anthropic.ContentBlockParam[] };
    }
    if (turn.role === "system") return { role: "system", content: turn.text };
    const content: Anthropic.ContentBlockParam[] = turn.content.map((block) => {
      if (block.kind === "text") return { type: "text", text: block.text ?? "" };
      if (block.kind !== "file" || !block.fileId || !capabilitiesFor(id, model).readsPdf) {
        throw new DirectError("request", id);
      }
      return { type: "document", source: { type: "file", file_id: block.fileId } };
    });
    return { role: "user", content };
  });
}

function usage(message: Anthropic.Message) {
  return normalizeUsage({
    input: message.usage.input_tokens, output: message.usage.output_tokens,
    cacheRead: message.usage.cache_read_input_tokens,
    cacheWrite: message.usage.cache_creation_input_tokens,
  });
}

function stop(message: Anthropic.Message): TurnResult["stopReason"] {
  switch (message.stop_reason) {
    case "end_turn": case "stop_sequence": return "end_turn";
    case "max_tokens": return "max_tokens";
    case "refusal": return "refusal";
    default: return "other";
  }
}

function result(message: Anthropic.Message): TurnResult {
  const stopReason = stop(message); // Check before accessing text.
  const text = stopReason === "refusal" ? "" : message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text).join("");
  return { blocks: message.content, text, stopReason, usage: usage(message) };
}

/**
 * `output_config.effort` chỉ gửi khi model thật sự nhận mức đó. `off` và mức mà
 * model không xác nhận đều bỏ qua tham số — gửi bừa là 400 ở production.
 */
function effortConfig(req: Pick<ChatRequest, "model" | "reasoning">) {
  const caps = capabilitiesFor(id, req.model);
  if (req.reasoning === "off" || !caps.reasoning || !caps.reasoningLevels.includes(req.reasoning)) {
    return {};
  }
  return { output_config: { effort: req.reasoning } };
}

/** `thinking` bật khi còn suy luận; `off` thì bỏ hẳn, không gửi `budget_tokens`. */
function thinkingConfig(req: Pick<ChatRequest, "model" | "reasoning">) {
  const caps = capabilitiesFor(id, req.model);
  return req.reasoning !== "off" && caps.reasoningLevels.includes(req.reasoning)
    ? { thinking: { type: "adaptive" as const } }
    : {};
}

export function createDirectAnthropic(): ProviderAdapter {
  return {
    id, capabilities: capabilitiesFor(id, "claude-opus-5"),
    stream(auth, req) {
      return browserTurnStream(id, async function* () {
        const layout = buildMessages(req, id);
        const stream = client(auth).messages.stream({
          model: req.model, max_tokens: req.maxTokens,
          system: [{ type: "text", text: layout.leadingInstruction, cache_control: { type: "ephemeral" } }],
          messages: messages(layout, req.model), ...thinkingConfig(req), ...effortConfig(req),
          cache_control: { type: "ephemeral" },
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { text: event.delta.text };
          }
        }
        return result(await stream.finalMessage());
      });
    },
    async structured(auth, req: StructuredRequest) {
      try {
        const layout = buildMessages({ ...req, newTurn: req.instruction }, id);
        const response = await client(auth).messages.stream({
          model: req.model, max_tokens: req.maxTokens,
          system: [{ type: "text", text: layout.leadingInstruction, cache_control: { type: "ephemeral" } }],
          messages: messages(layout, req.model),
          ...thinkingConfig(req), cache_control: { type: "ephemeral" },
          output_config: {
            ...effortConfig(req).output_config,
            format: { type: "json_schema", schema: req.jsonSchema },
          },
        }).finalMessage();
        const stopReason = stop(response);
        if (stopReason !== "end_turn") throw new DirectError("provider", id);
        const text = result(response).text;
        return { data: JSON.parse(text) as unknown, blocks: response.content, usage: usage(response) };
      } catch (error) { throw browserError(id, error); }
    },
    async upload(auth, file) {
      try {
        const uploaded = await client(auth).files.upload({ file: await toFile(file, "cv.pdf") });
        return { id: uploaded.id, expiresAt: uploaded.expires_at ?? undefined };
      } catch (error) { throw browserError(id, error); }
    },
    async deleteFile(auth, fileId) {
      try { await client(auth).files.delete(fileId); }
      catch (error) { throw browserError(id, error); }
    },
    async listModels(auth) {
      try {
        const page = await client(auth).models.list();
        return page.data.map((model) => ({
          id: model.id, displayName: model.display_name,
          verified: model.capabilities ? {
            ...capabilitiesFor(id, model.id),
            readsPdf: model.capabilities.pdf_input.supported,
            structuredOutput: model.capabilities.structured_outputs.supported,
            reasoning: model.capabilities.thinking.types.adaptive.supported,
            reasoningLevels: (["low", "medium", "high"] as const).filter(
              (level) => model.capabilities!.effort[level].supported,
            ),
          } : null,
        }));
      } catch (error) { throw browserError(id, error); }
    },
  };
}
