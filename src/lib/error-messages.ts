/**
 * Map mã lỗi → thông báo tiếng Việt cho UI.
 *
 * Nguồn: design.md §7.2 "Ma trận xử lý". Nguyên tắc bất di bất dịch ở đó:
 * **mọi lỗi AI đều không làm trang crash** (AC-8) và **không bao giờ trả lỗi
 * trần** cho UI — luôn kèm một thông báo đọc được.
 *
 * Module này **không** có `"use client"` nên dùng được ở cả Server Component
 * (route handler trả `error.code`) lẫn Client Component (toast).
 *
 * Xem tasks.md 3.7 · design.md §7.2.
 */

export const AI_ERROR_CODES = [
  "refusal",
  "rate_limit",
  "network",
  "timeout",
  "no_api_key",
  "ollama_down",
  "schema",
  "db_locked",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/**
 * Thông báo mặc định theo design.md §7.2.
 *
 * `rate_limit` có placeholder `{n}` — số giây chờ được thay bằng `retryAfter`
 * do server trả về (xem `errorMessage()`).
 */
export const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  refusal: "AI không thể xử lý nội dung này. Bạn có thể diễn đạt lại.",
  rate_limit: "Quá nhiều yêu cầu, thử lại sau {n}s",
  network: "Không có kết nối tới máy chủ AI. Nội dung của bạn vẫn được giữ nguyên.",
  timeout: "AI phản hồi quá chậm. Nội dung của bạn vẫn được giữ nguyên.",
  no_api_key: "Chưa cấu hình API key — đang dùng chế độ offline",
  ollama_down: "Không kết nối được Ollama — dùng quy tắc cục bộ",
  schema: "AI trả về dữ liệu không đúng định dạng. Đang thử lại bằng quy tắc cục bộ.",
  db_locked: "Không ghi được, thử lại",
};

/** Lỗi nào nên hiển thị bằng toast, lỗi nào bằng banner cố định. */
export type ErrorSurface = "toast" | "banner";

export const ERROR_SURFACE: Record<AiErrorCode, ErrorSurface> = {
  refusal: "toast",
  rate_limit: "toast",
  network: "toast",
  timeout: "toast",
  // Thiếu API key là trạng thái cấu hình, không phải lỗi tức thời → banner.
  no_api_key: "banner",
  ollama_down: "toast",
  schema: "toast",
  db_locked: "toast",
};

/** Lỗi nào đáng gọi lại (hiện nút "Thử lại"). */
export const ERROR_RETRYABLE: Record<AiErrorCode, boolean> = {
  refusal: false,
  rate_limit: true,
  network: true,
  timeout: true,
  no_api_key: false,
  ollama_down: true,
  schema: true,
  db_locked: true,
};

/** TypeScript narrowing: mã lỗi có nằm trong bảng map không. */
export function isAiErrorCode(code: string): code is AiErrorCode {
  return (AI_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Lấy thông báo tiếng Việt cho một mã lỗi.
 *
 * - Mã lạ (không nằm trong bảng) → trả thông báo chung an toàn thay vì `undefined`
 *   để UI không bao giờ render `undefined` (AC-8).
 * - `rate_limit` → thay `{n}` bằng `retryAfter` (mặc định 5 giây).
 */
export function errorMessage(
  code: string,
  options: { retryAfter?: number } = {},
): string {
  if (!isAiErrorCode(code)) {
    return "Có lỗi xảy ra. Vui lòng thử lại.";
  }
  const template = ERROR_MESSAGES[code];
  if (code === "rate_limit") {
    const seconds = Math.max(1, Math.round(options.retryAfter ?? 5));
    return template.replace("{n}", String(seconds));
  }
  return template;
}

/** Lỗi này có nên hiển thị nút "Thử lại" không. */
export function isRetryableError(code: string): boolean {
  return isAiErrorCode(code) ? ERROR_RETRYABLE[code] : false;
}

/** Lỗi này hiển thị dạng toast hay banner. */
export function errorSurface(code: string): ErrorSurface {
  return isAiErrorCode(code) ? ERROR_SURFACE[code] : "toast";
}

/**
 * Tone của toast cho một mã lỗi.
 *
 * `no_api_key` là `warning` (chưa cấu hình, app vẫn chạy được offline) còn
 * các lỗi còn lại là `error`.
 */
export function errorTone(code: string): "success" | "error" | "info" | "warning" {
  if (code === "no_api_key") return "warning";
  return "error";
}
