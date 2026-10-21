/** The public origin is a configured trust anchor, never inferred from request headers. */
export function parsePublicOrigin(value: string | undefined, nodeEnv: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (value !== url.origin || url.username || url.password) return null;
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && (nodeEnv === "development" || nodeEnv === "test") &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  } catch {
    // No usable configured origin: mutations must fail closed.
  }
  return null;
}

export const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
} as const;

export function privateJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) headers.set(key, value);
  return Response.json(body, { ...init, headers });
}

/**
 * Single bypass switch for the whole app. Set DISABLE_ORIGIN_CHECK=1 to skip
 * origin enforcement across every API route in one place, without modifying
 * each route handler. Default is fail-closed (unset / "0").
 */
function originCheckDisabled(): boolean {
  const v = process.env.DISABLE_ORIGIN_CHECK;
  return v === "1" || v?.toLowerCase() === "true";
}

/** Reject before reading the request body or accessing storage/providers. */
export function rejectCrossOrigin(req: Request, expectedOrigin: string | null): Response | null {
  if (originCheckDisabled()) return null;
  const origin = req.headers.get("origin");
  if (!expectedOrigin || !origin || origin !== expectedOrigin) {
    return privateJson({ ok: false, error: "Forbidden origin" }, { status: 403 });
  }
  return null;
}
