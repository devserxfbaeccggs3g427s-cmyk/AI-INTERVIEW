import { parseSseStream, safeRawBlocks, type AuthedConfig, type Provider, type StreamHandle } from "./types";

type Endpoint = "models" | "chat/completions";
type SendRequest = (base: string, endpoint: Endpoint, init: RequestInit) => Promise<Response>;

export function createOpenAiCompatibleProvider(
  id: "openai" | "custom",
  resolveBase: (cfg: AuthedConfig) => string,
  send: SendRequest,
): Provider {
  const headers = (cfg: AuthedConfig): HeadersInit => {
    if (id === "openai" && !cfg._key) throw new Error("OpenAI: missing API key");
    return {
      "content-type": "application/json",
      ...(cfg._key ? { authorization: `Bearer ${cfg._key}` } : {}),
    };
  };

  return {
    id,

    async testKey(_, cfg) {
      const t0 = Date.now();
      try {
        const r = await send(resolveBase(cfg), "models", {
          method: "GET",
          headers: headers(cfg),
          signal: AbortSignal.timeout(8000),
        });
        const ms = Date.now() - t0;
        if (r.ok) {
          await r.body?.cancel();
          return { ok: true, detail: `HTTP ${r.status} • ${ms}ms`, latencyMs: ms };
        }
        const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return { ok: false, detail: err.error?.message?.slice(0, 200) ?? `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, detail: (e as Error).message.slice(0, 200) };
      }
    },

    async listModels(_, cfg) {
      try {
        const r = await send(resolveBase(cfg), "models", {
          method: "GET",
          headers: headers(cfg),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) {
          if (id === "custom") throw new Error(`Custom model listing returned HTTP ${r.status}`);
          return [];
        }
        const body = (await r.json()) as { data?: { id: string }[] };
        if (!Array.isArray(body.data)) {
          if (id === "custom") throw new Error("Custom model listing did not contain a data array");
          return [];
        }
        return body.data.filter((m) => typeof m.id === "string").map((m) => ({ id: m.id }));
      } catch (error) {
        if (id === "custom") throw error;
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

      const res = await send(resolveBase(cfg), "chat/completions", {
        method: "POST",
        headers: headers(cfg),
        body,
        signal: opts.abortSignal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => res.statusText);
        throw new Error(`${id} HTTP ${res.status}: ${txt.slice(0, 300)}`);
      }

      const blocks: Record<string, unknown> = { provider: id, model: cfg.model, stream: true };
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
}
