import { createOpenAiCompatibleProvider } from "./openai-wire";

const OPENAI_BASE = "https://api.openai.com/v1";

export const openaiProvider = createOpenAiCompatibleProvider(
  "openai",
  () => OPENAI_BASE,
  (base, endpoint, init) => fetch(`${base}/${endpoint}`, init),
);
