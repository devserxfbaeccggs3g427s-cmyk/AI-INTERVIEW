import type { TextDelta, TurnResult, TurnStream } from "../providers/types";

/** Browser SDK errors can include request bodies, URLs, or headers. Never surface them. */
export class DirectError extends Error {
  constructor(
    readonly code: "auth" | "model" | "billing" | "rate_limit" | "network" | "request" | "provider",
    readonly provider: string,
  ) {
    const messages = {
      auth: "API key không hợp lệ hoặc đã hết hạn.",
      model: "Model không tồn tại hoặc tài khoản chưa có quyền dùng.",
      billing: "Tài khoản provider gặp vấn đề thanh toán.",
      rate_limit: "Provider đang giới hạn lượt gọi. Vui lòng thử lại sau.",
      network: "Không kết nối được với provider từ trình duyệt (có thể do CORS). Hãy chuyển sang chế độ qua server.",
      request: "Provider không chấp nhận yêu cầu. Hãy kiểm tra model và cấu hình.",
      provider: "Provider không thể hoàn tất yêu cầu. Vui lòng thử lại.",
    };
    super(`${provider}: ${messages[code]}`);
    this.name = "DirectError";
  }
}

/**
 * Chuẩn hoá lỗi của SDK thành thông báo không nhạy cảm.
 *
 * Không bao giờ gắn `error.message`, URL hay body vào kết quả: SDK trình duyệt có
 * thể nhúng cả request body (chứa CV của người dùng) vào message. Xem §10.4.
 */
export function browserError(provider: string, error: unknown): DirectError {
  if (error instanceof DirectError) return error;
  // `JSON.parse` hỏng không có HTTP status. Gộp nó vào "network" sẽ bảo người
  // dùng đổi chế độ gọi vì CORS — hoàn toàn sai nguyên nhân.
  if (error instanceof SyntaxError) return new DirectError("request", provider);
  const status =
    typeof error === "object" && error !== null && "status" in error &&
    typeof error.status === "number" ? error.status : undefined;
  const code = status === 401 || status === 403 ? "auth"
    : status === 404 ? "model"
    : status === 402 ? "billing"
    : status === 429 ? "rate_limit"
    : status === 400 ? "request"
    : status === undefined ? "network" : "provider";
  return new DirectError(code, provider);
}

export function requireBrowserKey(key: string, provider: string): void {
  if (typeof window === "undefined" || !key?.trim()) {
    throw new DirectError("auth", provider);
  }
}

/** Only start work when the caller iterates. `final` settles on completion or failure. */
export function browserTurnStream(
  provider: string,
  produce: () => AsyncGenerator<TextDelta, TurnResult>,
): TurnStream {
  let resolve!: (result: TurnResult) => void;
  let reject!: (reason: DirectError) => void;
  const final = new Promise<TurnResult>((res, rej) => { resolve = res; reject = rej; });
  // A consumer may abandon iteration after an error; ensure no unhandled rejection.
  void final.catch(() => {});
  let started = false;
  return {
    final,
    async *[Symbol.asyncIterator]() {
      if (started) throw new DirectError("request", provider);
      started = true;
      try {
        const iterator = produce();
        for (;;) {
          const item = await iterator.next();
          if (item.done) { resolve(item.value); return; }
          yield item.value;
        }
      } catch (error) {
        const safe = browserError(provider, error);
        reject(safe);
        throw safe;
      }
    },
  };
}
