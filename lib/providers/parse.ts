import { z } from "zod";
import { requireApiKey, validateCustomBaseUrl } from "@/lib/validate";
import { normalizeBaseUrl } from "@/lib/net/url-policy";
import { getProviderSpec, isProviderEnabled, PROVIDER_IDS, type ProviderId } from "./registry";
import type { AuthedConfig } from "./types";

export const modelConfigInput = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  model: z.string().min(1).max(200),
  baseUrl: z.string().trim().max(2048).optional(),
  temperature: z.number().min(0).max(1).default(0.4),
  maxTokens: z.number().int().min(64).max(32000).default(4096),
  topP: z.number().min(0).max(1).default(0.95),
});

/** Validate request fields and provider availability before reaching an implementation. */
export function parseModelConfig<T extends z.ZodObject<typeof modelConfigInput.shape & z.ZodRawShape>>(
  raw: unknown,
  apiKey: string | undefined,
  schema: T,
  options: { allowMissingKey?: boolean } = {},
): { ok: true; body: z.infer<T>; cfg: AuthedConfig; keyError: string | null } | { ok: false; error: string } {
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.message };

  const body = result.data;
  // Route-specific fields remain on body; the shared model fields were parsed by the same schema.
  const config = body as z.infer<typeof modelConfigInput>;
  if (!isProviderEnabled(config.provider)) {
    return { ok: false, error: getProviderSpec(config.provider).disabledReason };
  }
  if (apiKey && apiKey.length > 500) return { ok: false, error: "API key is too long" };

  const keyError = requireApiKey(config.provider, apiKey);
  if (keyError && !options.allowMissingKey) return { ok: false, error: keyError };

  let baseUrl: string | undefined;
  if (config.provider === "custom") {
    if (!config.baseUrl) return { ok: false, error: "Custom provider requires a Base URL" };
    const error = validateCustomBaseUrl(config.baseUrl);
    if (error) return { ok: false, error };
    try {
      baseUrl = normalizeBaseUrl(config.baseUrl, { allowPrivate: process.env.ALLOW_PRIVATE_BASE_URL === "1" });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const cfg: AuthedConfig = {
    provider: config.provider,
    model: config.model,
    base_url: baseUrl ?? null,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
    _key: apiKey,
    _base: baseUrl,
  };
  return { ok: true, body, cfg, keyError };
}
