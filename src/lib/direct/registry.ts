import type { ProviderAdapter, ProviderId } from "../providers/types";
import { DirectError } from "./browser-fetch";

/** Lazy imports keep other provider SDKs out of the active browser transport chunk. */
export async function directTransport(provider: ProviderId): Promise<ProviderAdapter> {
  switch (provider) {
    case "anthropic": return (await import("./anthropic")).createDirectAnthropic();
    case "openai": return (await import("./openai")).createDirectOpenAI();
    case "gemini": return (await import("./gemini")).createDirectGemini();
    case "custom": throw new DirectError("request", "custom");
  }
}
