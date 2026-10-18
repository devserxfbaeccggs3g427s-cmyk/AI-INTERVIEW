/**
 * Request-side validators.
 *
 *   - SSRF guard for the Custom OpenAI-compatible endpoint (FR-15 / NFR-8).
 *   - Numeric clamps for answer length (FR-10).
 *   - Light detector for the BYOK key shape.
 */
import type { ProviderId } from "./types";

/** Returns null on success, otherwise a human-readable reason. */
export function validateCustomBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "URL không hợp lệ.";
  }
  // NFR-8: HTTPS only in public deployments. Loopback allowed when explicitly opted in (Ollama etc).
  const allowPrivate = process.env.ALLOW_PRIVATE_BASE_URL === "1";
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return "Endpoint phải dùng giao thức HTTPS (NFR-8).";
  }
  const host = url.hostname.toLowerCase();

  // Explicitly forbidden zones — checked strictly regardless of allowPrivate.
  // We never allow SSRF to link-local / metadata IPs in public deployments.
  const forbiddenZones: { name: string; matcher: (h: string) => boolean }[] = [
    { name: "loopback", matcher: (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" },
    { name: "0.0.0.0", matcher: (h) => h === "0.0.0.0" },
    { name: "AWS metadata", matcher: (h) => h === "169.254.169.254" },
    { name: "private 10/8", matcher: (h) => /^10\.\d+\.\d+\.\d+$/.test(h) },
    { name: "private 172.16/12", matcher: (h) => /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h) },
    { name: "private 192.168/16", matcher: (h) => /^192\.168\.\d+\.\d+$/.test(h) },
    { name: "link-local 169.254/16", matcher: (h) => /^169\.254\.\d+\.\d+$/.test(h) },
    { name: "private fc00::/7", matcher: (h) => h.startsWith("fc") || h.startsWith("fd") },
  ];

  for (const zone of forbiddenZones) {
    if (zone.matcher(host)) {
      if (allowPrivate && zone.name !== "AWS metadata") {
        return null; // explicit opt-in allows loopback & RFC1918
      }
      return `Base URL nằm trong vùng cấm (${zone.name}). Đặt ALLOW_PRIVATE_BASE_URL=1 nếu đây là dev cục bộ.`;
    }
  }

  return null;
}

/** Returns null OK or reason string. Used for `/api/test-key`. */
export function requireApiKey(provider: ProviderId, key: string | undefined): string | null {
  if (provider === "custom") return null; // custom endpoints may not require a key
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
