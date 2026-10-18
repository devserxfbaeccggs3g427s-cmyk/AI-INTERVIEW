/**
 * Custom (OpenAI-compatible) provider.
 *
 * Reuses the OpenAI chat/completions wire format but with a user-supplied base URL.
 * Route handler MUST validate base URL against SSRF (lib/validate.ts) BEFORE
 * instantiating this provider.
 */
import { openaiProvider } from "./openai";
import type { Provider } from "./types";

export const customProvider: Provider = {
  ...openaiProvider,
  id: "custom",
};
