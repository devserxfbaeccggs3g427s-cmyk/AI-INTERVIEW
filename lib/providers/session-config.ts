import type { SessionRow } from "../types";
import { normalizeBaseUrl } from "../net/url-policy";
import { validateCustomBaseUrl } from "../validate";
import type { AuthedConfig } from "./types";

type SessionConfigResult =
  | { ok: true; cfg: AuthedConfig }
  | { ok: false; error: string };

/** Keep one interview on its original provider, model and destination. */
export function resolveSessionConfig(session: SessionRow, submitted: AuthedConfig): SessionConfigResult {
  if (session.provider !== submitted.provider || session.model !== submitted.model) {
    return { ok: false, error: "Session provider or model differs from the submitted configuration. Restore this session's configuration and retry." };
  }

  let baseUrl: string | undefined;
  if (session.provider === "custom") {
    if (!session.base_url) return { ok: false, error: "Session has no Custom Base URL. Create a new session." };
    const error = validateCustomBaseUrl(session.base_url);
    if (error) return { ok: false, error };
    try {
      baseUrl = normalizeBaseUrl(session.base_url, { allowPrivate: process.env.ALLOW_PRIVATE_BASE_URL === "1" });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    if (baseUrl !== submitted.base_url) {
      return { ok: false, error: "Custom Base URL differs from the original session. Restore it and retry." };
    }
  }

  return {
    ok: true,
    cfg: {
      provider: session.provider,
      model: session.model,
      base_url: baseUrl ?? null,
      temperature: session.temperature,
      max_tokens: session.max_tokens,
      top_p: session.top_p,
      _key: submitted._key,
      _base: baseUrl,
    },
  };
}
