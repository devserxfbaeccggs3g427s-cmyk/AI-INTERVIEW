import { StringDecoder } from "node:string_decoder";

import { capabilitiesFor } from "./capabilities";
import { guardedCustomRequest } from "./outbound-guard";
import type {
  AiConfig, ChatRequest, ModelInfo, ProviderAdapter, ProviderAuth,
  StructuredRequest, StructuredResult, TextDelta, TurnResult, TurnStream,
  Usage,
} from "./types";

/**
 * Minimal OpenAI-compatible Chat Completions subset. In particular, no SDK is
 * allowed to use its own fetch/agent: every outbound call must be DNS-pinned.
 * The caller must supply the base URL when constructing the adapter.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const NO_CACHE: Usage = { input: 0, output: 0, cacheRead: null, cacheWrite: null };

type Message = { role: "system" | "user" | "assistant"; content: string };

type Completion = {
  choices?: Array<{ message?: { role?: string; content?: unknown; refusal?: unknown }; finish_reason?: unknown }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function baseMessages(req: ChatRequest | StructuredRequest): Message[] {
  if (req.attachments?.some((block) => block.kind !== "text")) {
    throw new Error("Custom endpoint does not support file attachments");
  }
  const messages: Message[] = [{
    role: "system", content: `${req.coreSystem}\n\n${req.sessionConfig}`,
  }];
  for (const turn of req.history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else {
      // Blocks carry the original `choices[0].message`; never silently accept
      // a different provider's transcript or unsupported tool-call content.
      if (turn.blocks.length !== 1) throw new Error("Invalid custom transcript");
      const block = turn.blocks[0];
      if (!block || typeof block !== "object" || Array.isArray(block) ||
          !("role" in block) || block.role !== "assistant" ||
          !("content" in block) || typeof block.content !== "string" ||
          "tool_calls" in block || "function_call" in block || "refusal" in block) {
        throw new Error("Invalid custom transcript");
      }
      messages.push({ role: "assistant", content: block.content });
    }
  }
  const attachments = (req.attachments ?? []).map((block) => block.text ?? "").join("\n");
  messages.push({ role: "user", content: `${"newTurn" in req ? req.newTurn : req.instruction}${attachments ? `\n${attachments}` : ""}` });
  return messages;
}

function usage(value: Completion["usage"]): Usage {
  return {
    input: typeof value?.prompt_tokens === "number" ? value.prompt_tokens : 0,
    output: typeof value?.completion_tokens === "number" ? value.completion_tokens : 0,
    cacheRead: null,
    cacheWrite: null,
  };
}

function stopReason(value: unknown): TurnResult["stopReason"] {
  switch (value) {
    case "stop": return "end_turn";
    case "length": return "max_tokens";
    case "content_filter": return "refusal";
    default: return "other";
  }
}

async function readJson(response: NodeJS.ReadableStream): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Custom response exceeds size limit");
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Custom endpoint returned an invalid response");
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkHttp(status: number | undefined): void {
  if (!status || status < 200 || status >= 300) {
    // Never surface response bodies/headers: they can echo the API key, CV, or URL.
    throw new Error("Custom endpoint request failed");
  }
}

export function createCustomAdapter(baseUrl: string): ProviderAdapter {
  // No URL/network work in the constructor. The guard validates on EVERY call.
  return {
    id: "custom",
    capabilities: capabilitiesFor("custom", ""),

    stream(auth: ProviderAuth, req: ChatRequest): TurnStream {
      const messages = baseMessages(req);
      let resolveFinal!: (result: TurnResult) => void;
      let rejectFinal!: (error: Error) => void;
      const final = new Promise<TurnResult>((resolve, reject) => {
        resolveFinal = resolve;
        rejectFinal = reject;
      });
      // Avoid an unhandled rejection if a caller abandons the iterator early.
      void final.catch(() => {});
      let started = false;
      async function* iterate(): AsyncGenerator<TextDelta> {
        if (started) throw new Error("Custom stream can only be consumed once");
        started = true;
        let response: Awaited<ReturnType<typeof guardedCustomRequest>>["response"] | undefined;
        let settled = false;
        try {
          ({ response } = await guardedCustomRequest(baseUrl, "chat/completions", {
            method: "POST", apiKey: auth.apiKey,
            body: JSON.stringify({ model: req.model, messages, stream: true,
              max_tokens: req.maxTokens, stream_options: { include_usage: true } }),
          }));
          checkHttp(response.statusCode);
          let pending = "";
          let total = 0;
          let text = "";
          let finished = false;
          let done = false;
          let reason: TurnResult["stopReason"] = "other";
          let tokens = NO_CACHE;
          const decoder = new StringDecoder("utf8");
          for await (const chunk of response) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > MAX_RESPONSE_BYTES) throw new Error("Custom stream exceeds size limit");
            pending += decoder.write(buffer);
            pending = pending.replace(/\r\n/g, "\n");
            let index: number;
            while ((index = pending.indexOf("\n\n")) !== -1) {
              const event = pending.slice(0, index);
              pending = pending.slice(index + 2);
              const data = event.split("\n").filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart()).join("\n");
              if (!data) continue;
              if (data === "[DONE]") { done = true; continue; }
              if (done) throw new Error("Unexpected data after stream completion");
              let parsed: unknown;
              try { parsed = JSON.parse(data); } catch { throw new Error("Invalid custom stream event"); }
              if (!object(parsed)) throw new Error("Invalid custom stream event");
              if (object(parsed.usage)) {
                tokens = usage(parsed.usage as Completion["usage"]);
              }
              if (!Array.isArray(parsed.choices)) throw new Error("Invalid custom stream choices");
              for (const choice of parsed.choices) {
                if (!object(choice) || (choice.index !== undefined && choice.index !== 0)) continue;
                if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
                  finished = true;
                  reason = stopReason(choice.finish_reason);
                }
                if (object(choice.delta) && typeof choice.delta.content === "string") {
                  text += choice.delta.content;
                  yield { text: choice.delta.content };
                }
              }
            }
          }
          pending += decoder.end();
          if (!done || !finished || pending.trim()) {
            throw new Error("Custom stream ended without final event");
          }
          settled = true;
          resolveFinal({ text: reason === "refusal" ? "" : text,
            blocks: [{ role: "assistant", content: text }],
            stopReason: reason, usage: tokens });
        } catch {
          const error = new Error("Custom provider stream failed");
          settled = true;
          rejectFinal(error);
          throw error;
        } finally {
          response?.destroy();
          if (!settled) rejectFinal(new Error("Custom stream cancelled"));
        }
      }
      return { [Symbol.asyncIterator]: iterate, final };
    },

    async structured(auth: ProviderAuth, req: StructuredRequest): Promise<StructuredResult> {
      // No structured-output parameter: incompatible endpoints may ignore it.
      const messages = baseMessages(req);
      const { response } = await guardedCustomRequest(baseUrl, "chat/completions", {
        method: "POST", apiKey: auth.apiKey,
        body: JSON.stringify({ model: req.model, messages, max_tokens: req.maxTokens }),
      });
      try {
        checkHttp(response.statusCode);
        const payload = await readJson(response);
        if (!object(payload) || !Array.isArray(payload.choices) || !object(payload.choices[0])) {
          throw new Error("Invalid custom completion");
        }
        const completion = payload as Completion;
        const choice = completion.choices![0];
        if (stopReason(choice.finish_reason) !== "end_turn" ||
            !object(choice.message) || choice.message.role !== "assistant" ||
            "refusal" in choice.message || "tool_calls" in choice.message ||
            "function_call" in choice.message ||
            typeof choice.message.content !== "string") {
          throw new Error("Custom completion stopped without valid text");
        }
        let data: unknown;
        try { data = JSON.parse(choice.message.content); } catch { data = undefined; }
        return { data, blocks: [choice.message], usage: usage(completion.usage) };
      } finally {
        response.destroy();
      }
    },

    async listModels(auth: ProviderAuth, cfg: AiConfig): Promise<ModelInfo[]> {
      if (cfg.callMode !== "proxy" || cfg.provider !== "custom" ||
          cfg.baseUrl !== baseUrl) throw new Error("Invalid custom endpoint configuration");
      const { response } = await guardedCustomRequest(baseUrl, "models", {
        method: "GET", apiKey: auth.apiKey,
      });
      try {
        checkHttp(response.statusCode);
        const payload = await readJson(response);
        if (!object(payload) || !Array.isArray(payload.data)) {
          throw new Error("Invalid custom model list");
        }
        return payload.data.filter((item): item is { id: string } =>
          object(item) && typeof item.id === "string")
          .map((item) => ({ id: item.id, displayName: item.id, verified: null }));
      } finally {
        response.destroy();
      }
    },
  };
}
