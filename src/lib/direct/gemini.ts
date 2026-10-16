import { FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Content, GenerateContentResponse, Part } from "@google/genai";
import { capabilitiesFor } from "../providers/capabilities";
import type { ChatRequest, ProviderAdapter, ProviderAuth, StructuredRequest, TurnResult } from "../providers/types";
import { normalizeUsage } from "../usage";
import { browserError, browserTurnStream, DirectError, requireBrowserKey } from "./browser-fetch";

const id = "gemini" as const;

function client(auth: ProviderAuth): GoogleGenAI {
  requireBrowserKey(auth.apiKey, id);
  return new GoogleGenAI({ apiKey: auth.apiKey });
}

function contents(req: ChatRequest): Content[] {
  const history: Content[] = req.history.map((turn) => turn.role === "assistant"
    ? { role: "model", parts: turn.blocks as Part[] }
    : { role: "user", parts: [{ text: turn.text }] });
  const parts: Part[] = [{ text: req.newTurn }];
  for (const attachment of req.attachments ?? []) {
    if (attachment.kind === "text") parts.push({ text: attachment.text ?? "" });
    else if (attachment.fileId) parts.push({ fileData: {
      fileUri: attachment.fileId, mimeType: attachment.mediaType ?? "application/pdf",
    } });
    else throw new DirectError("request", id);
  }
  history.push({ role: "user", parts });
  return history;
}

/** `structured()` không có `newTurn` — cấu hình chỉ cần các trường chung. */
type ConfigInput = Pick<ChatRequest, "model" | "coreSystem" | "sessionConfig" | "reasoning" | "maxTokens">;

function config(req: ConfigInput) {
  const caps = capabilitiesFor(id, req.model);
  // `minimal` không đồng nghĩa `off`. Với `off`, bỏ thinkingConfig để model
  // dùng mặc định; chỉ gửi mức đã được xác nhận cho đúng model.
  const thinkingLevel = req.reasoning !== "off" && caps.reasoningLevels.includes(req.reasoning)
    ? ({ low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM,
      high: ThinkingLevel.HIGH } as const)[req.reasoning]
    : undefined;
  return {
    systemInstruction: req.coreSystem + "\n" + req.sessionConfig,
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
        const stream = await client(auth).models.generateContentStream({
          model: req.model, contents: contents(req), config: config(req),
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
        const response = await client(auth).models.generateContent({
          model: req.model, contents: contents({ ...req, newTurn: req.instruction }),
          config: { ...config(req), responseMimeType: "application/json", responseJsonSchema: req.jsonSchema },
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
