/**
 * OpenAI provider — direct REST against chat/completions (legacy), streaming via SSE.
 * Compatible with both chat.completions and most OpenAI-compatible providers.
 */
import { parseSseStream, safeRawBlocks, type Provider, type StreamHandle } from "./types";
import type { ModelConfig } from "../types";

function openaiUrl(_cfg: ModelConfig): string {
  // Custom base URL wins; fall through to api.openai.com.
  const base = (_cfg as unknown as { _base?: string })._base?.replace(/\/$/, "");
  return `${base || "https://api.openai.com/v1"}/chat/completions`;
}

export const openaiProvider: Provider = {
  id: "openai",

  async testKey(_, cfg) {
    const t0 = Date.now();
    const base = (cfg as unknown as { _base?: string })._base?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    try {
      const r = await fetch(`${base}/models`, {
        method: "GET",
        headers: openaiHeaders(cfg),
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      if (r.ok) return { ok: true, detail: `HTTP ${r.status} • ${ms}ms` };
      const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      return {
        ok: false,
        detail: err.error?.message?.slice(0, 200) ?? `HTTP ${r.status}`,
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  },

  async listModels(_, cfg) {
    const base = (cfg as unknown as { _base?: string })._base?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    const k = (cfg as unknown as { _key?: string })._key;
    if (!k) return [];
    try {
      const r = await fetch(`${base}/models`, { headers: openaiHeaders(cfg) });
      if (!r.ok) return [];
      const body = (await r.json()) as { data: { id: string }[] };
      return body.data.map((m) => ({ id: m.id }));
    } catch {
      return [];
    }
  },

  async streamChat(cfg, messages, opts) {
    const t0 = Date.now();
    const body = JSON.stringify({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? cfg.max_tokens,
      temperature: opts.temperature ?? cfg.temperature,
      top_p: opts.topP ?? cfg.top_p,
      stream: true,
      messages,
    });

    const res = await fetch(openaiUrl(cfg), {
      method: "POST",
      headers: openaiHeaders(cfg),
      body,
      signal: opts.abortSignal,
    });

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }

    const blocks: Record<string, unknown> = {
      provider: "openai",
      model: cfg.model,
      stream: true,
    };
    let prompt_tokens: number | undefined;
    let completion_tokens: number | undefined;
    let finish_reason: string | undefined;

    let resolveMeta!: (value: Awaited<StreamHandle["meta"]>) => void;
    const meta: StreamHandle["meta"] = new Promise((resolve) => {
      resolveMeta = resolve;
    });
    const textStream = (async function* () {
      try {
        for await (const evt of parseSseStream(res.body!)) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(evt);
          } catch {
            continue;
          }
          const choice = (parsed.choices as { delta?: { content?: string }; finish_reason?: string }[] | undefined)?.[0];
          if (choice?.delta?.content) yield choice.delta.content;
          if (choice?.finish_reason) finish_reason = choice.finish_reason;
          const usage = (parsed as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          if (usage?.prompt_tokens !== undefined) prompt_tokens = usage.prompt_tokens;
          if (usage?.completion_tokens !== undefined) completion_tokens = usage.completion_tokens;
        }
        blocks.usage = { prompt_tokens, completion_tokens, finish_reason };
        resolveMeta({
          latency_ms: Date.now() - t0,
          prompt_tokens,
          completion_tokens,
          finish_reason,
          raw_blocks: safeRawBlocks(blocks),
        });
      } catch (error) {
        resolveMeta({ latency_ms: Date.now() - t0, raw_blocks: safeRawBlocks(blocks) });
        throw error;
      }
    })();

    return { textStream, meta };
  },
};

function openaiHeaders(cfg: ModelConfig): HeadersInit {
  const k = (cfg as unknown as { _key?: string })._key;
  if (!k) throw new Error("OpenAI: missing API key");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${k}`,
  };
}
