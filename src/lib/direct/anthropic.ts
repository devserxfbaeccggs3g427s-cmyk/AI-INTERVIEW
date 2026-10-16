import Anthropic, { toFile } from "@anthropic-ai/sdk";
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
function messages(req: ChatRequest): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  let configPlaced = false;
  for (const turn of req.history) {
    if (turn.role === "assistant") {
      result.push({ role: "assistant", content: turn.blocks as Anthropic.ContentBlockParam[] });
      continue;
    }
    result.push({ role: "user", content: turn.text });
    if ("synthetic" in turn && turn.synthetic && req.sessionConfig) {
      result.push({ role: "system", content: req.sessionConfig });
      configPlaced = true;
    }
  }
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: req.newTurn }];
  for (const attachment of req.attachments ?? []) {
    if (attachment.kind === "text") content.push({ type: "text", text: attachment.text ?? "" });
    else if (attachment.fileId) content.push({ type: "document", source: { type: "file", file_id: attachment.fileId } });
    else throw new DirectError("request", id);
  }
  result.push({ role: "user", content });
  if (!configPlaced && req.sessionConfig) result.push({ role: "system", content: req.sessionConfig });
  return result;
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
        const stream = client(auth).messages.stream({
          model: req.model, max_tokens: req.maxTokens,
          system: [{ type: "text", text: req.coreSystem, cache_control: { type: "ephemeral" } }],
          messages: messages(req), ...thinkingConfig(req), ...effortConfig(req),
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
        const response = await client(auth).messages.stream({
          model: req.model, max_tokens: req.maxTokens,
          system: [{ type: "text", text: req.coreSystem, cache_control: { type: "ephemeral" } }],
          messages: messages({ ...req, newTurn: req.instruction }),
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
