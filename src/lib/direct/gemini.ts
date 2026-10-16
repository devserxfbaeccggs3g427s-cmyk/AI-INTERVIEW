import { FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Content, GenerateContentResponse, Part } from "@google/genai";
import { buildMessages, type PromptLayout } from "../interview";
import { capabilitiesFor } from "../providers/capabilities";
import type { ChatRequest, ProviderAdapter, ProviderAuth, StructuredRequest, TurnResult } from "../providers/types";
import { normalizeUsage } from "../usage";
import { browserError, browserTurnStream, DirectError, requireBrowserKey } from "./browser-fetch";

const id = "gemini" as const;

function client(auth: ProviderAuth): GoogleGenAI {
  requireBrowserKey(auth.apiKey, id);
  return new GoogleGenAI({ apiKey: auth.apiKey });
}

function contents(layout: PromptLayout, model: string): Content[] {
  return layout.messages.map((turn) => {
    if (turn.role === "assistant") return { role: "model", parts: turn.blocks as Part[] };
    if (turn.role === "system") throw new DirectError("request", id);
    const parts: Part[] = turn.content.map((block) => {
      if (block.kind === "text") return { text: block.text ?? "" };
      if (block.kind !== "file" || !block.fileId || !capabilitiesFor(id, model).readsPdf) {
        throw new DirectError("request", id);
      }
      return { fileData: {
        fileUri: block.fileId, mimeType: block.mediaType ?? "application/pdf",
      } };
    });
    return { role: "user", parts };
  });
}

/** `structured()` không có `newTurn` — cấu hình chỉ cần các trường chung. */
type ConfigInput = Pick<ChatRequest, "model" | "reasoning" | "maxTokens">;

function config(req: ConfigInput, layout: PromptLayout) {
  const caps = capabilitiesFor(id, req.model);
  // `minimal` không đồng nghĩa `off`. Với `off`, bỏ thinkingConfig để model
  // dùng mặc định; chỉ gửi mức đã được xác nhận cho đúng model.
  const thinkingLevel = req.reasoning !== "off" && caps.reasoningLevels.includes(req.reasoning)
    ? ({ low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM,
      high: ThinkingLevel.HIGH } as const)[req.reasoning]
    : undefined;
  return {
    systemInstruction: layout.leadingInstruction,
    maxOutputTokens: req.maxTokens,
    ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
  };
}

function stop(response: GenerateContentResponse): TurnResult["stopReason"] {
  if (response.promptFeedback?.blockReason) return "refusal";
  switch (response.candidates?.[0]?.finishReason) {
    case FinishReason.STOP: return "end_turn";
    case FinishReason.MAX_TOKENS: return "max_tokens";
    case FinishReason.SAFETY: case FinishReason.RECITATION: case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT: return "refusal";
    default: return "other";
  }
}

function usage(response: GenerateContentResponse) {
  const raw = response.usageMetadata;
  return normalizeUsage({ input: raw?.promptTokenCount, output: raw?.candidatesTokenCount,
    cacheRead: raw?.cachedContentTokenCount, cacheWrite: null });
}

/** Chỉ phần `text`, bỏ `thought`. Văn bản suy luận không phải câu hỏi để hiển thị. */
function textOf(parts: Part[]): string {
  return parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
}

function result(response: GenerateContentResponse, parts = response.candidates?.[0]?.content?.parts ?? []): TurnResult {
  const stopReason = stop(response);
  return { blocks: parts, text: stopReason === "refusal" ? "" : textOf(parts),
    stopReason, usage: usage(response) };
}

export function createDirectGemini(): ProviderAdapter {
  return {
    id, capabilities: capabilitiesFor(id, "gemini-3.6-flash"),
    stream(auth, req) {
      return browserTurnStream(id, async function* () {
        const layout = buildMessages(req, id);
        const stream = await client(auth).models.generateContentStream({
          model: req.model, contents: contents(layout, req.model), config: config(req, layout),
        });
        const parts: Part[] = [];
        let final: GenerateContentResponse | undefined;
        for await (const chunk of stream) {
          // Chunk kết thúc mang `finishReason` và `usageMetadata`; giữ chunk có
          // nhiều thông tin nhất, không giả định nó luôn là chunk cuối.
          if (chunk.promptFeedback?.blockReason || chunk.candidates?.[0]?.finishReason || chunk.usageMetadata) {
            final = chunk;
          }
          const newParts = chunk.candidates?.[0]?.content?.parts ?? [];
          parts.push(...newParts);
          const text = textOf(newParts);
          if (text && !chunk.promptFeedback?.blockReason) yield { text };
        }
        if (!final) throw new DirectError("provider", id);
        return result(final, parts);
      });
    },
    async structured(auth, req: StructuredRequest) {
      // Model không có structured output: đường dự phòng §6.3 của ứng dụng
      // phụ trách parse, không phải `JSON.parse` trên văn bản tự do.
      if (!capabilitiesFor(id, req.model).structuredOutput) throw new DirectError("request", id);
      try {
        const layout = buildMessages({ ...req, newTurn: req.instruction }, id);
        const response = await client(auth).models.generateContent({
          model: req.model, contents: contents(layout, req.model),
          config: { ...config(req, layout), responseMimeType: "application/json", responseJsonSchema: req.jsonSchema },
        });
        if (stop(response) !== "end_turn") throw new DirectError("provider", id);
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        return { data: JSON.parse(textOf(parts)) as unknown, blocks: parts, usage: usage(response) };
      } catch (error) { throw browserError(id, error); }
    },
    async upload(auth, file) {
      try {
        const uploaded = await client(auth).files.upload({ file, config: { mimeType: "application/pdf" } });
        if (!uploaded.uri || !uploaded.name) throw new DirectError("provider", id);
        return { id: uploaded.uri, expiresAt: uploaded.expirationTime };
      } catch (error) { throw browserError(id, error); }
    },
    async deleteFile(auth, fileId) {
      try {
        const name = new URL(fileId).pathname.replace(/^\//, "");
        if (!name.startsWith("files/")) throw new DirectError("request", id);
        await client(auth).files.delete({ name });
      } catch (error) { throw browserError(id, error); }
    },
    async listModels(auth) {
      try {
        const pager = await client(auth).models.list();
        const models = [];
        for await (const model of pager) {
          if (!model.name) continue;
          const name = model.name.replace(/^models\//, "");
          models.push({ id: name, displayName: model.displayName ?? name,
            verified: null });
        }
        return models;
      } catch (error) { throw browserError(id, error); }
    },
  };
}
