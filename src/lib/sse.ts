/**
 * Khung SSE — nơi duy nhất phát frame — T-2.1.
 *
 * Bốn quy tắc của file này, không ngoại lệ:
 *
 *   1. **Chỉ khung `data:`**, không dùng `event:`. Client đọc bằng `fetch` + reader
 *      chứ không dùng `EventSource`, vì `EventSource` chỉ nhận GET và không mang
 *      được body (docs/02-DESIGN.md §3.7).
 *   2. **Mọi luồng còn mở kết thúc bằng đúng một `done` hoặc `error`.** Điều này
 *      nằm trong **cấu trúc**, không nằm trong kỷ luật của người viết: `turnStream()`
 *      tự theo dõi đã phát frame kết thúc chưa, và nếu `produce()` trả về hoặc ném
 *      mà chưa phát, nó phát frame `error` thay. Thêm một nhánh thoát mới vào
 *      `produce()` cũng không tạo ra luồng thiếu frame cuối.
 *   3. `X-Accel-Buffering: no` để nginx không gom frame rồi đẩy cả một lần. Thiếu
 *      nó, "hiển thị dần từng token" (FR-5) biến thành xuất hiện cả khối.
 *   4. Delta được phát **ngay khi tới**, không gom rồi phát một lượt. Gom lại thì
 *      khung `data:` vẫn chạy đúng, nhưng người dùng thấy cả câu trả lời xuất hiện
 *      trong một nhịp — hỏng FR-5 mà không hỏng test nào.
 */

import { logEvent } from "./log";
import { messageFor, requestId } from "./errors";
import type { Language, Usage } from "./providers/types";

/** Thông tin lượt, gửi một lần đầu. */
export type MetaFrame = {
  type: "meta";
  sessionId: string;
  questionNumber: number;
  questionsTotal: number;
  mode: "strict" | "coaching";
  language: Language;
};

/** Một mảnh văn bản mới. Client nối vào bong bóng đang hiện. */
export type DeltaFrame = { type: "delta"; text: string };

/** Lượt hoàn tất; `assistantBlocks` đã được ghi vào `turns` trước khi frame này đi. */
export type DoneFrame = {
  type: "done";
  stopReason: "end_turn";
  assistantBlocks: unknown[];
  sessionComplete: boolean;
  usage: Usage;
};

/**
 * Lượt hỏng. `code` là mã đã phân loại để client hiển thị, `message` đã bản địa hoá
 * sẵn theo ngôn ngữ phiên — client không dịch lại, vì dịch ở client là dịch sai
 * chỗ (NFR-3).
 */
export type ErrorFrame = {
  type: "error";
  code: string;
  message: string;
  requestId: string;
};

export type TerminalFrame = DoneFrame | ErrorFrame;
export type SseFrame = MetaFrame | DeltaFrame | TerminalFrame;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  // Không có dòng này, nginx/proxy sẽ gom hết frame rồi đẩy một lần.
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

/** Một khung: `data: <JSON>\n\n`. Không có trường hợp nào sinh ra `event:`. */
export function encodeFrame(frame: SseFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

function isTerminal(frame: SseFrame): frame is TerminalFrame {
  return frame.type === "done" || frame.type === "error";
}

/**
 * Gửi khung vào luồng đang mở.
 *
 * Hàm này **ném** khi client đã ngắt, để phía gọi biết mà dừng. Nuốt lỗi ở đây là
 * cách chắc chắn nhất để tiêu tiền cho một câu trả lời không ai đọc — đó là lý do
 * `sse_client_disconnected` tồn tại (§9.3).
 */
export type FrameSink = (frame: SseFrame) => void;

export class StreamDisconnected extends Error {
  constructor() {
    super("SSE client disconnected");
  }
}

/** Hàm sinh nội dung luồng: nhận `sink` để phát frame, trả về frame kết thúc đã phát. */
export type TurnProducer = (sink: FrameSink) => Promise<TerminalFrame>;

/**
 * Đóng gói một lượt thành `Response` luồng.
 *
 * `produce` phát frame kết thúc rồi trả về nó; `turnStream` kiểm lại và **tự phát
 * thay** nếu `produce` kết thúc mà chưa phát — kể cả khi nó ném. Đó là chỗ bảo đảm
 * của §3.7.
 *
 * Client ngắt giữa chừng là ngoại lệ **đã biết**: kết nối đã đóng nên không có chỗ
 * nào để gửi. `produce` ở `stream-turn.ts` dừng ngay khi `sink` ném, và đóng iterator
 * của provider để không giữ tiến trình lời gọi.
 */
export function turnStream(produce: TurnProducer, id: string = requestId(), signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let terminalSent = false;
        let disconnected = signal?.aborted ?? false;
        const disconnect = () => { disconnected = true; };
        signal?.addEventListener("abort", disconnect, { once: true });
        const sink: FrameSink = (frame) => {
          if (disconnected || cancelled) throw new StreamDisconnected();
          // Đúng **một** frame kết thúc. Frame thứ hai là lỗi của người viết, và bỏ
          // qua nó an toàn hơn là gửi hai frame làm client hiểu nhầm.
          if (isTerminal(frame)) {
            if (terminalSent) return;
            terminalSent = true;
          }
          try {
            controller.enqueue(encoder.encode(encodeFrame(frame)));
          } catch {
            throw new StreamDisconnected();
          }
        };

        try {
          const terminal = await produce(sink);
          if (!terminalSent) sink(terminal);
        } catch (error) {
          if (error instanceof StreamDisconnected || disconnected) {
            logEvent({ event: "sse_client_disconnected", requestId: id });
          } else {
            if (!terminalSent) {
              try {
                sink({ type: "error", code: "internal", message: messageFor("internal"), requestId: id });
              } catch (sinkError) {
                if (!(sinkError instanceof StreamDisconnected)) throw sinkError;
              }
            }
            logEvent({ event: "turn_failed", requestId: id, code: "internal", status: 500 });
          }
        } finally {
          signal?.removeEventListener("abort", disconnect);
          try {
            controller.close();
          } catch {
            // Client đã đóng: `close()` trên luồng đã huỷ là ném.
          }
        }
      },
      cancel() {
        // `cancel()` không dừng producer ngay nếu SDK đang chờ token; `sink` kế tiếp
        // sẽ ném và đóng iterator.
        cancelled = true;
      },
    }),
    { headers: SSE_HEADERS },
  );
}