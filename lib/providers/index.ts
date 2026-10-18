/**
 * Provider dispatcher.
 *
 * Callers pass a ModelConfig + transient apiKey/baseUrl. We attach them to a
 * shallow copy of the config to avoid TS friction (the Provider interface
 * doesn't expose _key / _base). The provider implementation grabs them from
 * that copy.
 *
 * SECURITY: this dispatcher must NEVER log cfg._key / cfg._base, never cache
 * them, and never let them outlive the caller scope.
 */
import type { ModelConfig, ProviderId } from "../types";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { customProvider } from "./custom";
import type { Provider } from "./types";

export const providers: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  custom: customProvider,
};

export function withCredentials(
  cfg: ModelConfig,
  key: string | undefined,
  baseUrl?: string,
): ModelConfig & { _key?: string; _base?: string } {
  return { ...cfg, _key: key, _base: baseUrl };
}

export function getProvider(id: ProviderId): Provider {
  const p = providers[id];
  if (!p) throw new Error(`Provider not implemented: ${id}`);
  return p;
}
