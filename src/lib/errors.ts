/**
 * Lớp exception typed cho tầng AI (design.md §7.1).
 *
 * Vì sao cần lớp riêng thay vì `throw new Error(...)`:
 *   - Router phải **quyết định fallback** dựa trên *loại* lỗi, không dựa trên
 *     nội dung chuỗi (chuỗi thì dễ vỡ khi thay đổi message).
 *   - Route handler cần map lỗi → mã lỗi ổn định cho UI
 *     (`refusal` / `rate_limit` / `network` / `timeout` / `no_api_key` /
 *     `ollama_down` / `schema` / `unavailable`) — ma trận ở design.md §7.2.
 *
 * Xem tasks.md 2.3 · SPEC.md §5.7–§5.8.
 */

/** AI từ chối xử lý nội dung (`stop_reason: "refusal"`) — không phải lỗi hệ thống. */
export class AiRefusalError extends Error {
  /** `stop_reason` gốc từ API, ví dụ `"refusal"`. */
  readonly stopReason: string;

  constructor(message: string, stopReason = "refusal") {
    super(message);
    this.name = "AiRefusalError";
    this.stopReason = stopReason;
  }
}

/** Vượt giới hạn tần suất (HTTP 429) — UI hiển thị "thử lại sau {n}s". */
export class AiRateLimitError extends Error {
  /** Số giây client nên chờ trước khi thử lại (nếu API có trả về). */
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "AiRateLimitError";
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

/** Lỗi mạng (DNS, kết nối đứt, 5xx) — có thể thử lại. */
export class AiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNetworkError";
  }
}

/**
 * Provider không dùng được: thiếu `ANTHROPIC_API_KEY`, Ollama không chạy
 * (`ECONNREFUSED`), hoặc provider từ chối phục vụ model đó.
 *
 * Khác `AiNetworkError` ở chỗ: lỗi này **không** retry được — retry cũng
 * vẫn hỏng.
 *
 * `reason` phân biệt các nguyên nhân — UI cần hướng dẫn khác nhau:
 * mở Cài đặt (thiếu key) vs bật Ollama (local chết) vs provider không phục vụ.
 */
export class AiUnavailableError extends Error {
  /** Nguyên nhân cụ thể — quyết định mã lỗi trả về cho UI. */
  readonly reason: "no_api_key" | "ollama_down" | "unavailable";

  constructor(
    message: string,
    reason: "no_api_key" | "ollama_down" | "unavailable" = "no_api_key",
  ) {
    super(message);
    this.name = "AiUnavailableError";
    this.reason = reason;
  }
}

/** Quá thời gian chờ (Anthropic hoặc Ollama đều dùng chung loại này). */
export class AiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTimeoutError";
  }
}

/** Response của AI không khớp schema — `issues` là danh sách lỗi zod để hiển thị/log. */
export class ValidationError extends Error {
  /** Danh sách vấn đề cụ thể, mỗi phần tử là 1 chuỗi mô tả. */
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Kiểm tra một lỗi có phải lỗi của tầng AI hay không.
 *
 * Dùng `instanceof` thay vì `name` vì `name` có thể bị minify/đổi; nhưng để
 * chắc, ta kiểm tra cả `name` (phòng khi 2 bản module khác nhau cùng tồn tại
 * trong bundle → `instanceof` fail nhưng `name` vẫn khớp).
 */
export function isAiError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AiRefusalError" ||
    error.name === "AiRateLimitError" ||
    error.name === "AiNetworkError" ||
    error.name === "AiUnavailableError" ||
    error.name === "AiTimeoutError" ||
    error.name === "ValidationError"
  );
}

/** Mã lỗi ổn định cho UI — khớp với ma trận design.md §7.2. */
export type AiErrorCode =
  | "refusal"
  | "rate_limit"
  | "network"
  | "timeout"
  | "no_api_key"
  | "ollama_down"
  | "schema"
  | "unavailable";

/**
 * Map exception → mã lỗi mà UI hiểu.
 *
 * `AiUnavailableError` có 2 nguyên nhân rất khác nhau về mặt thông điệp:
 * thiếu API key (hướng dẫn mở Cài đặt) và Ollama chết (hướng dẫn bật Ollama).
 * Ta phân biệt bằng `reason` (không đoán theo message — message có thể chứa
 * cả 2 từ khoá, ví dụ "…hãy bật Ollama **hoặc cấu hình API key**").
 */
export function toAiErrorCode(error: unknown): AiErrorCode {
  if (error instanceof AiRefusalError) return "refusal";
  if (error instanceof AiRateLimitError) return "rate_limit";
  if (error instanceof AiTimeoutError) return "timeout";
  if (error instanceof ValidationError) return "schema";
  if (error instanceof AiNetworkError) return "network";
  if (error instanceof AiUnavailableError) {
    // `ollama_down` là mã riêng; `unavailable` → trả về `unavailable`.
    return error.reason === "ollama_down" ? "ollama_down" : error.reason === "no_api_key" ? "no_api_key" : "unavailable";
  }
  return "unavailable";
}
