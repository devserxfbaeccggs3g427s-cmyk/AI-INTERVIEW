/**
 * Anthropic provider — direct REST against messages-v1, streaming via SSE.
 *
 * Important: the inner AsyncIterable must be safely iterable from both the
 * caller (textStream) and the meta-collection path. We tee() a single
 * underlying generator so that meta can drain concurrently without starving
 * the caller.
 */
import { parseSseStream, safeRawBlocks, type Provider, type ChatMessage } from "./types";
import type { ModelConfig } from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const anthropicProvider: Provider = {
  id: "anthropic",

  async testKey(_, cfg) {
    const t0 = Date.now();
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: anthropicHeaders(cfg),
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      const raw = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const ms = Date.now() - t0;
      if (r.ok) return { ok: true, detail: `HTTP ${r.status} • ${ms}ms`, latencyMs: ms };
      const err = (raw as { error?: { message?: string } }).error?.message ?? `HTTP ${r.status}`;
      return { ok: false, detail: err.slice(0, 200) };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  },

  async listModels() {
    // Anthropic has no public /v1/models endpoint; the static catalogue lives in lib/types.ts.
    return [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ];
  },

  async streamChat(cfg, messages, opts) {
    const t0 = Date.now();
    const system = messages.find((m) => m.role === "system")?.content;
    const convo = messages.filter((m) => m.role !== "system").map(anthropicMessage);

    const body = JSON.stringify({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? cfg.max_tokens,
      temperature: opts.temperature ?? cfg.temperature,
      top_p: opts.topP ?? cfg.top_p,
      stream: true,
      ...(system ? { system } : {}),
      messages: convo,
    });

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders(cfg),
      body,
      signal: opts.abortSignal,
    });

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }

    // Internal generator — runs the SSE loop once, accumulating usage metadata.
    const blocks: Record<string, unknown> = { provider: "anthropic", model: cfg.model };
    const usage = { prompt_tokens: undefined as number | undefined, completion_tokens: undefined as number | undefined, finish_reason: undefined as string | undefined };

    async function* source() {
      for await (const evt of parseSseStream(res.body!)) {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(evt); } catch { continue; }
        if (parsed.type === "content_block_delta" && parsed.delta) {
          const d = parsed.delta as { type?: string; text?: string };
          if (d.type === "text_delta" && typeof d.text === "string") yield d.text;
        } else if (parsed.type === "message_delta") {
          const delta = parsed.delta as { stop_reason?: string };
          if (delta?.stop_reason) usage.finish_reason = delta.stop_reason;
        } else if (parsed.type === "message_start") {
          const msg = parsed.message as { usage?: { input_tokens?: number; output_tokens?: number } };
          usage.prompt_tokens = msg?.usage?.input_tokens;
          usage.completion_tokens = msg?.usage?.output_tokens;
          blocks.message_start = parsed.message;
        } else if (parsed.type === "message_stop") {
          blocks.message_stop = parsed;
        }
      }
    }

    // Tee into two iterators so the caller and the meta collector don't race.
    const [a, b] = tee(source());
    const textStream: AsyncIterable<string> = a;
    const meta = (async () => {
      for await (const _ of b) void _; // drain second leg
      blocks.usage = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, finish_reason: usage.finish_reason };
      return {
        latency_ms: Date.now() - t0,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        finish_reason: usage.finish_reason,
        raw_blocks: safeRawBlocks(blocks),
      };
    })();

    return { textStream, meta };
  },
};

function anthropicHeaders(cfg: ModelConfig): HeadersInit {
  const apiKey = mustKey(cfg);
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

function anthropicMessage(m: ChatMessage) {
  return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
}

function mustKey(cfg: ModelConfig): string {
  const k = (cfg as unknown as { _key?: string })._key;
  if (!k) throw new Error("Anthropic: missing API key (BYOK not provided)");
  return k;
}

/** Tee an AsyncIterable into two independent consumers. */
function tee<T>(src: AsyncIterable<T>): [AsyncIterable<T>, AsyncIterable<T>] {
  const queue: T[] = [];
  const pending: Array<(v: IteratorResult<T>) => void> = [];
  const pendingErr: Array<(e: unknown) => void> = [];
  let done = false;
  let err: unknown = null;

  const pump = (async () => {
    try {
      for await (const v of src) {
        const wait = pending.shift();
        if (wait) wait({ value: v, done: false });
        else queue.push(v);
      }
      done = true;
      for (const w of pending) w({ value: undefined as unknown as T, done: true });
    } catch (e) {
      err = e;
      for (const w of pendingErr) w(e);
    }
  })();

  const make = (): AsyncIterable<T> => ({
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<T>>((resolve, reject) => {
          if (err) { reject(err); return; }
          if (queue.length) { resolve({ value: queue.shift()!, done: false }); return; }
          if (done) { resolve({ value: undefined as unknown as T, done: true }); return; }
          pending.push(resolve);
          pendingErr.push(reject);
        }),
      };
    },
  });

  // Suppress unhandled rejection if neither leg ever iterates.
  pump.catch(() => {});
  return [make(), make()];
}
