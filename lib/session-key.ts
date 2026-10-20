import type { ByokConfig } from "@/components/ByokConfigContext";
import { getProviderSpec } from "./providers/registry";
import type { SessionRow } from "./types";

function comparableBase(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password || url.search || url.hash) return null;
    let path = url.pathname.replace(/\/+$/, "");
    if (path.endsWith("/chat/completions")) path = path.slice(0, -"/chat/completions".length);
    if (!path) path = "/v1";
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

/** Never send a key saved for a different provider or custom endpoint. */
export function sessionKeyError(cfg: ByokConfig, session: SessionRow): string | null {
  if (getProviderSpec(session.provider).requiresApiKey && !cfg.apiKey) {
    return `Phiên này cần API Key của ${session.provider}. Hãy cấu hình lại khóa trước khi tiếp tục.`;
  }
  if (!cfg.apiKey) return null;
  if (cfg.provider !== session.provider) {
    return `API Key hiện được cấu hình cho ${cfg.provider}, nhưng phiên dùng ${session.provider}. Hãy chọn lại provider và nhập đúng khóa.`;
  }
  if (session.provider === "custom" && (!session.base_url || comparableBase(cfg.baseUrl) !== comparableBase(session.base_url))) {
    return "Base URL đã đổi từ khi tạo phiên. Hãy khôi phục URL cũ và kiểm tra API Key trước khi tiếp tục.";
  }
  return null;
}
