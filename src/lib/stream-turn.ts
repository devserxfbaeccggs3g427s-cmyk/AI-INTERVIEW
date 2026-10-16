/**
 * Sinh một lượt phỏng vấn — T-2.6, T-2.10.
 *
 * `streamTurn()` **phát delta ngay khi tới** rồi trả về frame kết thúc; nó không tự
 * quyết định việc ghi vào DB. Việc đó là của route, vì chỉ route mới biết `sessionId`
 * và số câu đã hỏi. Ranh giới này giữ đúng ba điều:
 *
 *   1. Delta tới lúc nào người dùng thấy lúc đó (FR-5). Gom delta lại để phát một
 *      lượt thì vẫn đúng về mặt giao thức, và hỏng đúng tính năng mà bài kiểm tra
 *      giao thức không bắt được.
 *   2. Mọi luồng còn mở đều có frame kết thúc — bảo đảm nằm ở `turnStream()`, không
 *      phụ thuộc vào việc hàm này có nhớ gọi `sink` với frame cuối hay không.
 *   3. Kiểm tra điều kiện dừng **trước** khi đọc nội dung, ở đúng một chỗ: xem
 *      `stopReasonError()` và phần gọi nó bên dưới.
 */

import { buildCvBlocks } from "./interview";
import type { ResolvedCv } from "./interview";
import { classifyProviderError, messageFor } from "./errors";
import type { ErrorCode } from "./errors";
import { logEvent } from "./log";
import { CORE_SYSTEM, renderSessionConfig } from "./prompts";
import { normalizeUsage } from "./usage";
import { StreamDisconnected } from "./sse";
import type { ErrorFrame, FrameSink, TerminalFrame } from "./sse";
import type { Usage } from "./providers/types";
import type {
  AiConfig,
  ChatRequest,
  ProviderAdapter,
  ProviderAuth,
  StopReason,
  TranscriptTurn,
} from "./providers/types";
import type { SessionConfigInput } from "./schemas";

/** §11: trần token của hội thoại. */
export const CONVERSATION_MAX_TOKENS = 3000;

export type TurnContext = {
  auth: ProviderAuth;
  adapter: ProviderAdapter;
  ai: AiConfig;
  config: SessionConfigInput;
  cv: ResolvedCv;
  /** Lịch sử nạp từ SQLite — không bao giờ từ client (FR-20). */
  history: TranscriptTurn[];
  /**
   * Câu trả lời của người dùng, hoặc lệnh mở đầu ở lượt đầu. `buildMessages()` ghép nó
   * vào lượt mới nhất, nên nó không còn nằm trong `history`.
   */
  newTurn: string;
  /** Chỉ đi vào log để đối chiếu sự cố — không bao giờ đi ra response (§9.1). */
  requestId: string;
};

export type TurnResult =
  | { kind: "done"; text: string; blocks: unknown[]; usage: Usage }
  | { kind: "error"; code: ErrorCode; message: string };

/**
 * Điều kiện dừng → mã lỗi. Từ chối và cắt cụt là hai việc khác nhau và có hai thông
 * báo khác nhau; gộp chung sẽ báo "thử lại" cho một lượt mà thử lại cũng hỏng.
 *
 * `other` không nói được là lỗi hay không, nên coi là lỗi nội bộ thay vì ghi transcript
 * mà không biết model đã nói xong chưa.
 */
function stopReasonError(stopReason: StopReason): ErrorCode | null {
  if (stopReason === "refusal") return "refusal";
  if (stopReason === "max_tokens") return "truncated";
  return stopReason === "end_turn" ? null : "internal";
}

/**
 * Chạy một lượt: phát delta vào `sink`, trả kết quả cuối.
 *
 * Đọc `stream.final` **trước** khi đọc `stopReason`, không phải trước khi đọc
 * iterator: với OpenAI/Gemini/Custom, iterator chính là nơi hoàn tất promise `final`.
 * Chờ `final` trước iterator sẽ deadlock. Gắn catch handler trước, tiêu thụ iterator,
 * rồi chờ `final` để lấy kết luận. Cả hai phải hoàn tất trước khi ghi DB.
 */
export async function streamTurn(context: TurnContext, sink: FrameSink): Promise<TurnResult> {
  const language = context.config.language;
  try {
    const stream = context.adapter.stream(context.auth, buildChatRequest(context));
    // `final` có thể reject trước khi iterator thoát: gắn handler ngay để không có
    // unhandled rejection, nhưng đợi iterator trước để phát hết delta.
    void stream.final.catch(() => {});
    await pump(stream, sink);
    const result = await stream.final;

    // **Điều kiện dừng trước, nội dung sau** — chỗ này là toàn bộ T-2.10.
    // `refusal` và `max_tokens` đều là HTTP 200.
    const code = stopReasonError(result.stopReason);
    if (code) {
      // Trả thông báo đã bản địa hoá. `refusalCategory` là chuỗi phân loại nội bộ của
      // hãng — đưa ra giao diện là lộ chi tiết model (NFR-3).
      logEvent({
        event: "turn_stopped",
        requestId: context.requestId,
        provider: context.adapter.id,
        code,
        stopReason: result.stopReason,
      });
      return { kind: "error", code, message: messageFor(code, language) };
    }
    if (!result.text.trim()) {
      // Câu rỗng không phải câu hỏi. Ghi nó vào transcript sẽ khiến lượt kế tiếp dựng
      // prompt từ một lượt trống — và trên Anthropic còn viết lại tiền tố cache.
      return { kind: "error", code: "internal", message: messageFor("internal", language) };
    }
    return { kind: "done", text: result.text, blocks: result.blocks, usage: normalizeUsage(result.usage) };
  } catch (error) {
    // Nếu sink ném vì client đã huỷ, `final` của vài SDK vẫn chưa settle. Bắt lỗi
    // của nó và để route dọn khoá/phiên; không chờ thêm token cho một kết nối đã đóng.
    if (error instanceof StreamDisconnected) throw error;
    // Không retry ở đây, cố ý. SDK chỉ tự retry **trước** khi luồng mở; sau khi đã có
    // byte, thử lại sẽ nhân đôi nội dung người dùng đã thấy (§9.2).
    const classified = classifyProviderError(error);
    logEvent({
      event: "provider_error",
      requestId: context.requestId,
      provider: context.adapter.id,
      code: classified.code,
      status: classified.status,
    });
    return { kind: "error", code: classified.code, message: messageFor(classified.code, language) };
  }
}

/**
 * Chuyển delta của provider ra khung `delta`.
 *
 * Lỗi iterator đi về caller; không nuốt rồi chờ `final` mù quáng — nếu `sink` ném
 * do client ngắt, `final` có thể không bao giờ settle sau khi đóng iterator.
 *
 * `finally` gọi `return()` để đóng iterator khi hỏng hoặc huỷ (§9.3).
 */
async function pump(stream: AsyncIterable<{ text: string }>, sink: FrameSink): Promise<void> {
  // `return()` chỉ có trong `AsyncIterator`, không có trong `AsyncIterable` — và
  // `for await` bỏ qua nó khi thoát do ném. Không có lời gọi tường minh, một luồng
  // bị huỷ vẫn giữ tiến trình lời gọi của provider mở: người dùng đã rời đi mà vẫn bị
  // tính tiền (§9.3).
  const iterator = stream[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      if (next.value.text) sink({ type: "delta", text: next.value.text });
    }
  } finally {
    await iterator.return?.().catch(() => {});
  }
}

/** Frame kết thúc cho một lượt hỏng — dựng ở đây để route không lặp lại thứ tự trường. */
export function errorTerminal(result: Extract<TurnResult, { kind: "error" }>, id: string): ErrorFrame {
  return { type: "error", code: result.code, message: result.message, requestId: id };
}

/** Frame kết thúc cho một lượt thành công. `sessionComplete` do route quyết định. */
export function doneTerminal(
  result: Extract<TurnResult, { kind: "done" }>,
  sessionComplete: boolean,
): TerminalFrame {
  return {
    type: "done",
    stopReason: "end_turn",
    assistantBlocks: result.blocks,
    sessionComplete,
    usage: result.usage,
  };
}

/**
 * Dựng `ChatRequest` — một chỗ, để mọi provider nhận đúng cùng một hình dạng.
 *
 * `buildMessages()` (gọi bên trong adapter) vẫn là nơi duy nhất quyết định thứ tự
 * prompt; hàm này chỉ chuẩn bị đầu vào.
 *
 * `buildCvBlocks()` ném lỗi thuần khi model không đọc PDF trực tiếp được, nhưng
 * `prepareCv()` đã chặn trường hợp đó **trước** khi gọi model — nên ở đây nó là lưới
 * an toàn chứ không phải đường lỗi bình thường.
 */
function buildChatRequest(context: TurnContext): ChatRequest {
  return {
    model: context.ai.model,
    coreSystem: CORE_SYSTEM,
    sessionConfig: renderSessionConfig(context.config),
    attachments: buildCvBlocks(context.cv, context.adapter.id, context.ai.model),
    history: context.history,
    newTurn: context.newTurn,
    reasoning: context.ai.reasoning,
    maxTokens: CONVERSATION_MAX_TOKENS,
    language: context.config.language,
  };
}