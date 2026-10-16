import { createAnthropicAdapter } from "./anthropic";
import { createCustomAdapter } from "./custom";
import { createGeminiAdapter } from "./gemini";
import { createOpenAIAdapter } from "./openai";
import type { AiConfig, ProviderAdapter } from "./types";

/** Không fallback sang một hãng khác khi provider không hợp lệ. */
export function getProviderAdapter(cfg: AiConfig): ProviderAdapter {
  const id = cfg.provider;
  switch (id) {
    case "anthropic":
      return createAnthropicAdapter();
    case "openai":
      return createOpenAIAdapter();
    case "gemini":
      return createGeminiAdapter();
    case "custom":
      if (!cfg.baseUrl) throw new Error("Thiếu base URL cho provider tuỳ chỉnh");
      return createCustomAdapter(cfg.baseUrl);
    default:
      throw new Error("Provider không được hỗ trợ");
  }
}
