/**
 * Biên lỗi dùng chung — T-2.1, T-2.2.
 *
 * Ba việc ở đây, và cả ba đều có một cách sai âm thầm đã bị chặn bằng kiểu:
 *
 *   1. **`redact()`** chạy trên mọi thứ đi ra log lẫn ra response. Không phản
 *      chiếu message/stack của lỗi DB hay đầu vào người dùng.
 *   2. **`classifyProviderError()`** ánh xạ lỗi của SDK sang mã ổn định để UI và
 *      log dùng chung. So khớp bằng `status`/`code` của SDK — **không** đoán bằng
 *      cách đọc message, vì message của SDK đổi theo phiên bản và theo hãng.
 *   3. **`validationResponse()`** trả 400 kèm **đường dẫn trường**, để UI báo đúng
 *      chỗ cần sửa thay vì "dữ liệu không hợp lệ" chung chung.
 *
 * File này không import SDK: nó nằm trong đồ thị import của route, và `classify`
 * phải so khớp bằng thuộc tính của object lỗi, không bằng `instanceof` với lớp SDK.
 */

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logEvent } from "./log";
import type { Language } from "./providers/types";

/** Mã lỗi ổn định — đây là hợp đồng với UI, không phải message của SDK. */
export type ErrorCode =
  | "invalid_key"
  | "model_not_found"
  | "billing"
  | "rate_limit"
  | "network"
  | "refusal"
  | "truncated"
  | "session_complete"
  | "session_conflict"
  | "unsupported_call_mode"
  | "invalid_cv_token"
  | "unsupported_file_type"
  | "file_too_large"
  | "pdf_no_text"
  | "internal";

/** Mã đi kèm HTTP tương ứng. Tách khỏi thông báo để test được bằng phép so sánh. */
const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_key: 401,
  model_not_found: 404,
  billing: 402,
  rate_limit: 429,
  network: 503,
  refusal: 200,
  truncated: 200,
  session_complete: 422,
  session_conflict: 409,
  unsupported_call_mode: 400,
  invalid_cv_token: 400,
  unsupported_file_type: 400,
  file_too_large: 400,
  pdf_no_text: 400,
  internal: 500,
};

/**
 * Đây là thông báo người dùng thấy, không phải log. Phải an toàn để hiển thị.
 *
 * Bản tiếng Anh phải **đủ bộ**, không phải "dịch mấy mã hiếm": một bảng thiếu mã sẽ
 * biến thông báo thành `undefined` ở đúng lúc người dùng đang nhìn phiên tiếng Anh,
 * và `undefined` là thứ tệ hơn thông báo sai ngôn ngữ.
 */
const MESSAGE: Record<ErrorCode, string> = {
  invalid_key: "API key không hợp lệ hoặc đã hết hạn.",
  model_not_found: "Model không tồn tại hoặc tài khoản chưa có quyền dùng model này.",
  billing: "Tài khoản đã hết hạn thuê bao hoặc không còn hạn mức tính tiền.",
  rate_limit: "Đã vượt giới hạn tần suất. Vui lòng thử lại sau ít phút.",
  network: "Không kết nối được tới nhà cung cấp. Vui lòng thử lại.",
  refusal: "Mô hình từ chối trả lời câu hỏi này.",
  truncated: "Câu hỏi bị cắt cụt vì hết giới hạn độ dài. Vui lòng thử lại.",
  session_complete: "Phiên phỏng vấn đã đủ số câu và đã kết thúc.",
  session_conflict: "Phiên đang được xử lý bởi một yêu cầu khác.",
  unsupported_call_mode:
    "Cấu hình này dùng chế độ gọi trực tiếp, nên không đi qua máy chủ. Hãy chuyển sang gọi qua máy chủ để mở phiên phỏng vấn.",
  invalid_cv_token: "Tệp CV không hợp lệ hoặc đã hết hạn. Vui lòng tải lại.",
  unsupported_file_type: "Chỉ chấp nhận tệp PDF.",
  file_too_large: "Tệp vượt quá giới hạn dung lượng cho phép.",
  pdf_no_text: "PDF không có văn bản để đọc (có thể là PDF dạng ảnh). Vui lòng dán văn bản CV thay thế.",
  internal: "Yêu cầu không thể hoàn tất. Vui lòng thử lại.",
};

const MESSAGE_EN: Record<ErrorCode, string> = {
  invalid_key: "The API key is invalid or has expired.",
  model_not_found: "That model does not exist, or your account cannot use it.",
  billing: "Your subscription has expired, or there is no remaining credit.",
  rate_limit: "Rate limit reached. Please try again in a few minutes.",
  network: "Could not reach the provider. Please try again.",
  refusal: "The model declined to answer this question.",
  truncated: "The question was cut off at the length limit. Please try again.",
  session_complete: "This interview has reached its question count and has ended.",
  session_conflict: "This session is already being handled by another request.",
  unsupported_call_mode:
    "This configuration uses direct browser calls, which do not go through the server. Switch to server calls to start an interview.",
  invalid_cv_token: "That CV file is invalid or has expired. Please upload it again.",
  unsupported_file_type: "Only PDF files are accepted.",
  file_too_large: "That file is larger than the allowed limit.",
  pdf_no_text:
    "That PDF has no extractable text (it may be a scanned image). Please paste your CV text instead.",
  internal: "The request could not be completed. Please try again.",
};

export type ClassifiedError = {
  code: ErrorCode;
  /** Thông báo đã bản địa hoá sẵn cho người dùng. */
  message: string;
  status: number;
};

/**
 * Lỗi do chính ứng dụng quyết định — mang mã, không cần suy ra từ SDK.
 *
 * Dùng class thay vì object `Error` + `code` rời vì `instanceof` ở đây là kiểu tra
 * đáng tin: nó không đoán bằng message, nên đổi câu chữ thông báo không làm hỏng
 * phân loại lỗi.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  /** Số HTTP của frame `error` trong luồng SSE luôn là 200 — xem `httpStatus()`. */
  constructor(code: ErrorCode, requestId: string) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.requestId = requestId;
  }
  readonly requestId: string;
}

/** Số HTTP đi kèm mã lỗi. */
export function httpStatus(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/**
 * Thông báo đã bản địa hoá cho mã lỗi, theo ngôn ngữ của phiên.
 *
 * Dịch **ở server** chứ không ở client: client không có bảng thông báo nào, và thêm
 * bản dịch vào bundle trình duyệt là chỗ thứ hai phải cập nhật mỗi khi câu chữ đổi.
 * Thiếu `language` thì mặc định tiếng Việt — ngôn ngữ mặc định của sản phẩm.
 */
export function messageFor(code: ErrorCode, language: Language = "vi"): string {
  return (language === "en" ? MESSAGE_EN : MESSAGE)[code];
}

export function requestId(): string {
  return randomUUID();
}

/** Hình dạng thuộc tính của lỗi SDK, đọc bằng duck-typing chứ không `instanceof`. */
type SdkError = { status?: unknown; code?: unknown; name?: unknown; message?: unknown };

function statusOf(error: unknown): number | null {
  const status = (error as SdkError | null)?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/**
 * Chuỗi trông như key của provider. Dùng để so khớp `code` khi SDK không kèm
 * `status` (một số SDK chỉ trả `code` dạng chuỗi).
 */
function isKnownSdkCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  return [
    "authentication_error", "invalid_api_key", "permission_error",
    "not_found_error", "billing_error", "rate_limit_error",
    "overloaded_error", "api_error", "connection_error",
  ].includes(code);
}

/**
 * Phân loại lỗi của provider — T-2.2, T-2.10.
 *
 * Thứ tự kiểm tra cố ý từ cụ thể tới rộng. Trong SDK TypeScript `APIConnectionError`
 * là **lớp con** của `APIError`; nếu kiểm tra `APIError` trước thì lỗi mạng sẽ bị
 * nuốt vào nhánh 500 chung và người dùng được bảo "thử lại" vô nghĩa.
 *
 * Không bao giờ đọc `error.message` để quyết định: message của SDK đổi theo hãng
 * và theo phiên bản, và đoán bằng message là cách chắc chắn nhất để lỗi 401 biến
 * thành 500 sau một lần cập nhật thư viện.
 */
export function classifyProviderError(error: unknown): ClassifiedError {
  const status = statusOf(error);
  const code = (error as SdkError | null)?.code;
  const name = (error as SdkError | null)?.name;

  // Lỗi mạng phải hỏi trước mọi thứ khác dựa trên status.
  if (status === null && (name === "APIConnectionError" || isConnectionCode(code))) {
    return classified("network");
  }
  if (status === 401 || code === "authentication_error" || code === "invalid_api_key") {
    return classified("invalid_key");
  }
  if (status === 402 || code === "billing_error") return classified("billing");
  if (status === 404 || code === "not_found_error" || code === "permission_error") {
    // 404 và "không có quyền" cùng gộp một thông báo: người dùng không tự phân
    // biệt được, và tách ra sẽ lộ tên model/tài khoản của họ qua thông báo lỗi.
    return classified("model_not_found");
  }
  if (status === 429 || code === "rate_limit_error") return classified("rate_limit");
  if (status === null && code !== undefined && !isKnownSdkCode(code)) {
    return classified("internal");
  }
  return classified("internal");
}

function isConnectionCode(code: unknown): boolean {
  return code === "connection_error" || code === "APIConnectionError";
}

function classified(code: ErrorCode): ClassifiedError {
  return { code, message: MESSAGE[code], status: HTTP_STATUS[code] };
}

/**
 * Dựng `ClassifiedError` từ `AppError` hoặc từ lỗi SDK — hàm mà route gọi để biết
 * cả mã lẫn thông báo.
 */
export function classify(error: unknown, id: string): ClassifiedError {
  if (error instanceof AppError) {
    return { code: error.code, message: MESSAGE[error.code], status: HTTP_STATUS[error.code] };
  }
  const result = classifyProviderError(error);
  logEvent({ event: "request_failed", requestId: id, code: result.code, status: result.status });
  return result;
}

/** Không phản chiếu message/stack của lỗi DB hay đầu vàu người dùng ra ngoài. */
export function redact(_error: unknown): string {
  return MESSAGE.internal;
}

/** Một lỗi xác thực: `{path, message}` cho từng trường sai. */
export type FieldIssue = { path: string; message: string };

/**
 * Chuẩn hoá lỗi Zod thành danh sách trường — T-2.1.
 *
 * Zod 4 gộp **mọi** trường lạ thành *một* issue `unrecognized_keys` ở `path: ""`,
 * còn tên khoá nằm ở `issue.keys` (ghi nhận ở docs/03-TASKS.md:128). Đọc mỗi khoá
 * thành một `FieldIssue` riêng là thứ duy nhất khiến UI báo đúng chỗ cần sửa; đọc
 * `path` thô thì UI nhận về `""` và không biết chỉ ra đâu.
 */
export function fieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.flatMap((issue): FieldIssue[] => {
    if (issue.code === "unrecognized_keys") {
      const keys = issue.keys ?? [];
      return keys.length > 0
        ? keys.map((key) => ({ path: key, message: "Trường không được phép" }))
        : [{ path: "", message: issue.message }];
    }
    return [{ path: issue.path.join("."), message: issue.message }];
  });
}

/** 400 kèm chi tiết trường. */
export function validationResponse(error: ZodError): Response {
  return Response.json(
    { error: "Dữ liệu không hợp lệ", fields: fieldIssues(error) },
    { status: 400 },
  );
}

/**
 * 400 kèm mã lỗi cụ thể — dùng cho lỗi không đến từ Zod (token CV hết hạn, tệp quá
 * lớn). `AppError` cho phép chi tiết vào response vì mã đã chọn từ tập hữu hạn ở
 * trên, không phải từ message của SDK.
 */
export function appErrorResponse(error: AppError): Response {
  return Response.json(
    { error: MESSAGE[error.code], code: error.code, requestId: error.requestId },
    { status: HTTP_STATUS[error.code] },
  );
}

/**
 * Response JSON cho lỗi, dùng ở endpoint **không** phải SSE.
 *
 * Endpoint SSE không dùng hàm này: một response JSON 500 ở giữa luồng là client
 * nhận được HTML rác thay vì frame `error`. Xem `stream-turn.ts`.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return validationResponse(
      error instanceof ZodError ? error : new ZodError([{ code: "custom", path: [], message: "JSON không hợp lệ" }]),
    );
  }
  if (error instanceof AppError) return appErrorResponse(error);
  const id = requestId();
  logEvent({ event: "request_failed", requestId: id, code: "internal", status: 500 });
  return Response.json({ error: MESSAGE.internal, code: "internal", requestId: id }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  const limit = 100_000;
  const length = request.headers.get("content-length");
  if (length !== null && (!Number.isFinite(Number(length)) || Number(length) > limit)) {
    throw new SyntaxError("Payload quá lớn");
  }
  if (!request.body) throw new SyntaxError("JSON không hợp lệ");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new SyntaxError("Payload quá lớn");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}