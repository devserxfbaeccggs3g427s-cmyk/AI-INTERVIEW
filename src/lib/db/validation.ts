import { z } from "zod";

export const settingsSchema = z.strictObject({
  provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.url().startsWith("https://").optional(),
  reasoning: z.enum(["off", "low", "medium", "high"]),
  callMode: z.enum(["proxy", "direct"]),
}).refine((settings) => settings.provider !== "custom" || !!settings.baseUrl, {
  message: "Endpoint tuỳ chỉnh cần base URL HTTPS",
});

export const createSessionSchema = z.strictObject({
  ai: settingsSchema,
  config: z.strictObject({
    role: z.string().trim().min(2).max(120),
    language: z.enum(["vi", "en"]),
    mode: z.enum(["strict", "coaching"]),
    length: z.enum(["short", "medium", "long"]),
  }),
  cvText: z.string().max(20_000).nullable().optional(),
});
