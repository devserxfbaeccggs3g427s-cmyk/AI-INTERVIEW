/**
 * Provider abstraction.
 *
 * Each provider implements two streaming surfaces:
 *
 *   streamInterview()     → AI question (and optional coaching micro-rubric) for one turn.
 *   streamEvaluation()    → final 4-pillar report conforming to EvaluationReportSchema.
 *
 * Keys are passed in via the per-request `AuthedConfig` and never persisted.
 *
 * IMPORTANT — Fetch-time only.
 *  - apiKey + baseUrl live in closure scope of one HTTP request.
 *  - We never log them, never write them to SQLite, never include them in the
 *    raw_blocks_json we persist on disk (we log only model, finish_reason,
 *    token counts, latency — see `safeRawBlocks()`).
 */
import type { ModelConfig, ProviderId } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallContext {
  /** Always provided; opaque session id from SQLite. */
  sessionId: string;
  /** Debug header for tracing — set internally to provider, never user input. */
  trace: string;
}

/** Per-request credential scope. Lives only as long as one HTTP request. */
export type AuthedConfig = ModelConfig & {
  _key?: string;
  _base?: string;
};

export interface StreamHandle {
  textStream: AsyncIterable<string>;
  meta: Promise<{
    latency_ms: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    finish_reason?: string;
    raw_blocks: Record<string, unknown>;
  }>;
}

/** Provider-implemented contract. */
export interface Provider {
  id: ProviderId;
  testKey(ctx: CallContext, cfg: AuthedConfig): Promise<{ ok: boolean; detail: string; latencyMs?: number }>;
  listModels(ctx: CallContext, cfg: AuthedConfig): Promise<{ id: string; label?: string }[]>;
  streamChat(
    cfg: AuthedConfig,
    messages: ChatMessage[],
    opts: { abortSignal?: AbortSignal; maxTokens?: number; temperature?: number; topP?: number },
  ): Promise<StreamHandle>;
}

/** Strip anything that smells like an api key from raw provider blocks. */
export function safeRawBlocks(blocks: unknown): Record<string, unknown> {
  const json = JSON.stringify(blocks ?? {});
  return JSON.parse(
    json
      .replace(/(sk-[a-zA-Z0-9_\-]{8,})/g, "[redacted-key]")
      .replace(/(sk-ant-[a-zA-Z0-9_\-]{8,})/g, "[redacted-ant-key]")
      .replace(/(AIza[a-zA-Z0-9_\-]{8,})/g, "[redacted-google-key]")
      .replace(/(sk-proj-[a-zA-Z0-9_\-]{8,})/g, "[redacted-openai-key]"),
  );
}

/** Attach credentials to a ModelConfig for the duration of one request. */
export function withCredentials(cfg: ModelConfig, apiKey?: string, baseUrl?: string): AuthedConfig {
  return { ...cfg, _key: apiKey, _base: baseUrl };
}

/** Common SSE chunk parser — handles multi-line `data: ...` and `data: [DONE]`. */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        yield payload;
      }
    }
  }
}
