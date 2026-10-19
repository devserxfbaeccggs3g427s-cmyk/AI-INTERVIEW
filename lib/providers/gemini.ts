/**
 * Google Gemini provider — REST against generateContent (stream), using x-goog-api-key.
 * Yields the SDK-free textual delta directly. Keeping the implementation tiny
 * means the rest of the app stays provider-agnostic.
 */
import { parseSseStream, safeRawBlocks, type Provider, type ChatMessage, type StreamHandle } from "./types";
import type { ModelConfig } from "../types";

function geminiUrl(cfg: ModelConfig): string {
  const model = encodeURIComponent(cfg.model);
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
}

export const geminiProvider: Provider = {
  id: "gemini",

  async testKey(_, cfg) {
    const t0 = Date.now();
    const k = (cfg as unknown as { _key?: string })._key;
    if (!k) return { ok: false, detail: "API Key is required" };
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
        { signal: AbortSignal.timeout(8000) },
      );
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
    const k = (cfg as unknown as { _key?: string })._key;
    if (!k) return [];
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
      );
      if (!r.ok) return [];
      const body = (await r.json()) as { models: { name: string }[] };
      return body.models
        .map((m) => ({ id: m.name.replace(/^models\//, "") }))
        .filter((m) => /(gemini|pro|flash|nano)/i.test(m.id));
    } catch {
      return [];
    }
  },

  async streamChat(cfg, messages, opts) {
    const t0 = Date.now();
    const k = (cfg as unknown as { _key?: string })._key;
    if (!k) throw new Error("Gemini: missing API key");

    const sys = messages.find((m) => m.role === "system")?.content;
    const convo = messages.filter((m) => m.role !== "system");
    const contents = convo.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body = JSON.stringify({
      contents,
      ...(sys
        ? {
            systemInstruction: { role: "system", parts: [{ text: sys }] },
          }
        : {}),
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? cfg.max_tokens,
        temperature: opts.temperature ?? cfg.temperature,
        topP: opts.topP ?? cfg.top_p,
      },
    });

    const res = await fetch(geminiUrl(cfg), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": k,
      },
      body,
      signal: opts.abortSignal,
    });

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }

    const blocks: Record<string, unknown> = { provider: "gemini", model: cfg.model };
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
          const candidates = parsed.candidates as
            | { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
            | undefined;
          const cand = candidates?.[0];
          const text = cand?.content?.parts?.map((p) => p.text ?? "").join("");
          if (text) yield text;
          if (cand?.finishReason) finish_reason = cand.finishReason;
          const usage = parsed.usageMetadata as
            | { promptTokenCount?: number; candidatesTokenCount?: number }
            | undefined;
          if (usage?.promptTokenCount !== undefined) prompt_tokens = usage.promptTokenCount;
          if (usage?.candidatesTokenCount !== undefined) completion_tokens = usage.candidatesTokenCount;
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

/* eslint-disable @typescript-eslint/no-unused-vars */
const _typecheck: ChatMessage = { role: "system", content: "" };
