import { guardedRequest } from "../net/guarded-transport";
import { createOpenAiCompatibleProvider } from "./openai-wire";

export const customProvider = createOpenAiCompatibleProvider(
  "custom",
  (cfg) => {
    if (!cfg._base) throw new Error("Custom provider requires a Base URL");
    return cfg._base;
  },
  guardedRequest,
);
