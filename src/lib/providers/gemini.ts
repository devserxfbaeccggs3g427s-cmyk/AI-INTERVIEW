import { FileState, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Content, GenerateContentResponse, GenerateContentResponseUsageMetadata, Part } from "@google/genai";

import { normalizeUsage } from "../usage";
import { capabilitiesFor } from "./capabilities";
import { buildMessages } from "../interview";
import type { PromptLayout } from "../interview";
import type {
  AiConfig,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAuth,
  StructuredRequest,
  StructuredResult,
  TextDelta,
  TurnResult,
  TurnStream,
  Usage,
} from "./types";

const ID = "gemini" as const;

function clientFor(auth: ProviderAuth): GoogleGenAI {
  // The SDK falls back to GOOGLE_API_KEY and environment-selected Vertex AI if
  // these options are absent. Never charge the server owner's credentials.
  if (!auth.apiKey.trim()) throw new Error("Missing Gemini API key");
  return new GoogleGenAI({ apiKey: auth.apiKey, enterprise: false });
}

function buildContents(layout: PromptLayout): Content[] {
  const contents: Content[] = [];
  for (const message of layout.messages) {
    if (message.role === "assistant") {
      // Preserve thought signatures and all other model parts, not just text.
      contents.push({ role: "model", parts: message.blocks as Part[] });
    } else if (message.role === "user") {
      const parts: Part[] = [];
      for (const block of message.content) {
        if (block.kind === "text") {
          if (block.text === undefined) throw new Error("Missing CV text");
          parts.push({ text: block.text });
        } else if (block.fileId) {
          parts.push({ fileData: {
            fileUri: block.fileId,
            mimeType: block.mediaType ?? "application/pdf",
          } });
        } else {
          throw new Error("Missing Gemini file URI");
        }
      }
      contents.push({ role: "user", parts });
    } else {
      throw new Error("Gemini does not support mid-conversation system messages");
    }
  }
  return contents;
}

function configFor(req: ChatRequest | StructuredRequest, layout: PromptLayout) {
  const supported = capabilitiesFor(ID, req.model).reasoningLevels;
  // There is no documented ThinkingLevel.OFF. An unsupported level must not
  // be sent: Gemini rejects it with 400 rather than silently downgrading.
  const level = req.reasoning !== "off" && supported.includes(req.reasoning)
    ? ({ low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM,
      high: ThinkingLevel.HIGH } as const)[req.reasoning]
    : undefined;
  return {
    // Gemini has no mid-conversation system role, so the session config joins
    // the leading instruction. Changing it invalidates the cacheable prefix;
    // never modify coreSystem itself. See docs/02-DESIGN.md §5.2.
    systemInstruction: layout.leadingInstruction,
    maxOutputTokens: req.maxTokens,
    automaticContinuation: false,
    ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
  };
}

function layoutFor(req: ChatRequest | StructuredRequest, instruction: string): PromptLayout {
  return buildMessages({ ...req, newTurn: instruction }, ID);
}

function stopReason(reason: FinishReason | undefined, blocked?: string): TurnResult["stopReason"] {
  if (blocked) return "refusal";
  switch (reason) {
    case FinishReason.STOP: return "end_turn";
    case FinishReason.MAX_TOKENS: return "max_tokens";
    case FinishReason.SAFETY:
    case FinishReason.RECITATION:
    case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII: return "refusal";
    default: return "other";
  }
}

function usageOf(metadata?: GenerateContentResponseUsageMetadata): Usage {
  return normalizeUsage({
    // promptTokenCount already includes cachedContentTokenCount.
    input: metadata?.promptTokenCount,
    // Thinking tokens are billed separately from candidate text tokens.
    output: metadata ? (metadata.candidatesTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0) : undefined,
    cacheRead: metadata?.cachedContentTokenCount,
    cacheWrite: null,
  });
}

function textOf(parts: Part[]): string {
  return parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
}

function resultOf(response: GenerateContentResponse): TurnResult {
  // Inspect finish and prompt feedback before reading content: blocked prompts
  // often have no candidate or text at all.
  const reason = stopReason(response.candidates?.[0]?.finishReason, response.promptFeedback?.blockReason);
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return {
    blocks: parts,
    text: reason === "refusal" ? "" : textOf(parts),
    stopReason: reason,
    ...(reason === "refusal" ? { refusalCategory: response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason } : {}),
    usage: usageOf(response.usageMetadata),
  };
}

function streamResponse(auth: ProviderAuth, req: ChatRequest): TurnStream {
  const client = clientFor(auth);
  let resolveFinal!: (result: TurnResult) => void;
  let rejectFinal!: (error: unknown) => void;
  const final = new Promise<TurnResult>((resolve, reject) => {
    resolveFinal = resolve;
    rejectFinal = reject;
  });

  async function* iterate(): AsyncGenerator<TextDelta> {
    const parts: Part[] = [];
    let finishReason: FinishReason | undefined;
    let blockReason: string | undefined;
    let usage: GenerateContentResponseUsageMetadata | undefined;
    try {
      const layout = layoutFor(req, req.newTurn);
      const stream = await client.models.generateContentStream({
        model: req.model,
        contents: buildContents(layout),
        config: configFor(req, layout),
      });
      for await (const chunk of stream) {
        // Chunks contain delta parts, not a final full model turn. Preserve the
        // entire ordered parts array (including thoughtSignature) for replay.
        const incoming = chunk.candidates?.[0]?.content?.parts ?? [];
        parts.push(...incoming);
        if (chunk.candidates?.[0]?.finishReason) finishReason = chunk.candidates[0].finishReason;
        if (chunk.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;
        // Within one stream usage is cumulative, not a per-chunk increment.
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        if (!blockReason) {
          const text = textOf(incoming);
          if (text) yield { text };
        }
      }
      if (!finishReason && !blockReason) throw new Error("Gemini stream ended without a finish reason");
      const reason = stopReason(finishReason, blockReason);
      resolveFinal({
        blocks: parts,
        text: reason === "refusal" ? "" : textOf(parts),
        stopReason: reason,
        ...(reason === "refusal" ? { refusalCategory: blockReason ?? finishReason } : {}),
        usage: usageOf(usage),
      });
    } catch (error) {
      rejectFinal(error);
      throw error;
    }
  }

  return { [Symbol.asyncIterator]: iterate, final };
}

/** File URIs are used in fileData; get/delete instead expect resource names. */
function fileNameFromUri(uri: string): string {
  const url = new URL(uri);
  const name = url.pathname.match(/(?:^|\/)files\/([a-z0-9-]+)$/)?.[1];
  if (!name) throw new Error("Invalid Gemini file URI");
  return `files/${name}`;
}

export function createGeminiAdapter(): ProviderAdapter {
  return {
    id: ID,
    capabilities: capabilitiesFor(ID, "gemini-3.6-flash"),
    stream: streamResponse,

    async structured(auth: ProviderAuth, req: StructuredRequest): Promise<StructuredResult> {
      if (!capabilitiesFor(ID, req.model).structuredOutput) {
        throw new Error("Gemini model does not support structured output");
      }
      const layout = layoutFor(req, req.instruction);
      const response = await clientFor(auth).models.generateContent({
        model: req.model,
        contents: buildContents(layout),
        config: {
          ...configFor(req, layout),
          responseMimeType: "application/json",
          responseJsonSchema: req.jsonSchema,
        },
      });
      const result = resultOf(response);
      if (result.stopReason !== "end_turn") {
        throw new Error(`Gemini structured response stopped: ${result.stopReason}`);
      }
      return {
        data: JSON.parse(result.text) as unknown,
        blocks: result.blocks,
        usage: result.usage,
      };
    },

    async upload(auth: ProviderAuth, file: Blob) {
      const client = clientFor(auth);
      let uploaded = await client.files.upload({
        file,
        config: { mimeType: "application/pdf" },
      });
      if (!uploaded.uri || !uploaded.name) throw new Error("Gemini upload returned no file URI");
      // Some files require processing before they can be referenced in a prompt.
      // Bound the wait so a stalled file cannot hold the request indefinitely.
      const name = uploaded.name;
      for (let attempt = 0; uploaded.state === FileState.PROCESSING && attempt < 30; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        uploaded = await client.files.get({ name });
      }
      if (uploaded.state === FileState.FAILED || uploaded.state === FileState.PROCESSING) {
        throw new Error("Gemini file processing failed or timed out");
      }
      if (!uploaded.uri) throw new Error("Gemini processed file has no URI");
      return { id: uploaded.uri, expiresAt: uploaded.expirationTime };
    },

    async deleteFile(auth: ProviderAuth, id: string): Promise<void> {
      await clientFor(auth).files.delete({ name: fileNameFromUri(id) });
    },

    async listModels(auth: ProviderAuth, _cfg: AiConfig): Promise<ModelInfo[]> {
      const pager = await clientFor(auth).models.list();
      const models: ModelInfo[] = [];
      for await (const model of pager) {
        if (!model.name) continue;
        const id = model.name.replace(/^models\//, "");
        models.push({
          id,
          displayName: model.displayName ?? id,
          // The list endpoint does not report verified capability flags.
          verified: null,
        });
      }
      return models;
    },
  };
}
