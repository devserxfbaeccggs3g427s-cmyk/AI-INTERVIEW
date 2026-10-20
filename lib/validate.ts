/**
 * Request-side validators.
 *
 *   - SSRF guard for the Custom OpenAI-compatible endpoint (FR-15 / NFR-8).
 *   - Numeric clamps for answer length (FR-10).
 *   - Light detector for the BYOK key shape.
 */
import type { ProviderId } from "./types";
import { getProviderSpec } from "./providers/registry";
import { classifyTarget, normalizeBaseUrl } from "./net/url-policy";

/** Returns null on success, otherwise a human-readable reason. */
export function validateCustomBaseUrl(raw: string): string | null {
  // Preflight checks the URL only. The guarded transport also verifies the actual
  // DNS destination at connection time, so a hostname cannot evade this policy.
  const allowPrivate = process.env.ALLOW_PRIVATE_BASE_URL === "1";
  try {
    return classifyTarget(new URL(normalizeBaseUrl(raw, { allowPrivate })), allowPrivate);
  } catch (error) {
    return (error as Error).message || "URL không hợp lệ.";
  }
}

/** Returns null OK or reason string. Used for `/api/test-key`. */
export function requireApiKey(provider: ProviderId, key: string | undefined): string | null {
  if (!getProviderSpec(provider).requiresApiKey) return null;
  if (!key) return "API Key is required.";
  if (key.length < 8) return "API Key quá ngắn.";
  return null;
}

export const MAX_ANSWER_CHARS = 4000;
export const MAX_CV_CHARS = 20_000;
export const MIN_ROLE_LEN = 2;
export const MAX_ROLE_LEN = 120;

/** Returns reason | null. */
export function validateStartSessionInput(input: {
  role?: string;
  language?: string;
  mode?: string;
  planned_rounds?: number;
  cv_source?: string;
}): string | null {
  const role = (input.role ?? "").trim();
  if (role.length < MIN_ROLE_LEN || role.length > MAX_ROLE_LEN) {
    return `Vị trí ứng tuyển phải từ ${MIN_ROLE_LEN}–${MAX_ROLE_LEN} ký tự.`;
  }
  if (input.language !== "vi" && input.language !== "en") return "Ngôn ngữ không hợp lệ.";
  if (input.mode !== "strict" && input.mode !== "coaching") return "Chế độ phỏng vấn không hợp lệ.";
  if (![5, 8, 12].includes(Number(input.planned_rounds))) return "Độ dài phiên phải là 5, 8 hoặc 12.";
  if (!["none", "paste", "pdf"].includes(String(input.cv_source))) return "CV source không hợp lệ.";
  return null;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
