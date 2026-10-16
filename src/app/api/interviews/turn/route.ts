/**
 * `POST /api/interviews/turn` — T-2.8, T-2.9.
 *
 * Request mang `{ai, sessionId, answer}` và **không** mang gì khác: không
 * `transcript`, không `turnCount`, không `config` (FR-20, §3.4). Server nạp lịch sử từ
 * SQLite, tự đếm câu đã hỏi, và tự suy ra cấu hình phiên — một nguồn sự thật, không
 * phải hai nơi phải khớp nhau.
 *
 * Kiểm tra nào **trước** khi gọi model, và vì sao:
 *
 *   - `answer` quá dài → `400` kèm chi tiết trường. Chặn ở schema nên không tốn token
 *     cho một câu mà chắc chắn bị từ chối (FR-10).
 *   - Số câu đã hỏi ≥ tổng → `422`. Gọi model rồi mới nhận ra là mua một lượt để trả
 *     lời "xong rồi".
 *   - Khoá RAM theo `sessionId` → `409`. Chiếm khoá **trước** khi đọc lịch sử, vì
 *     khoảng cần bảo vệ là giữa lúc đọc và lúc ghi — không có transaction nào mở
 *     suốt đoạn đó (§8.1). Đường lỗi tiền kiểm cũng phải nhả khoá.
 *   - Đổi provider/model giữa phiên → `404`. Gửi khối của hãng này sang hãng khác là
 *     dựng prompt hỏng; yêu cầu bắt đầu phiên mới (§8.4).
 */

import { getRepository } from "@/lib/db/repository";
import type { SessionRecord } from "@/lib/db/session-repo";
import { AppError, errorResponse, readJson, requestId } from "@/lib/errors";
import { authFromRequest } from "@/lib/interviews/auth";
import { acquireSessionLock } from "@/lib/interviews/lock";
import { getProviderAdapter } from "@/lib/providers/registry";
import { turnRequestSchema } from "@/lib/schemas";
import { turnStream } from "@/lib/sse";
import type { FrameSink, MetaFrame, TerminalFrame } from "@/lib/sse";
import { doneTerminal, errorTerminal, streamTurn } from "@/lib/stream-turn";
import type { ResolvedCv } from "@/lib/interview";
import type { TranscriptTurn } from "@/lib/providers/types";

export async function POST(request: Request) {
  const id = requestId();
  const repository = await getRepository();
  let unlock: (() => void) | null = null;

  try {
    const auth = authFromRequest(request, id);
    const input = turnRequestSchema.parse(await readJson(request));
    if (input.ai.callMode !== "proxy") throw new AppError("unsupported_call_mode", id);

    unlock = acquireSessionLock(input.sessionId);
    if (!unlock) throw new AppError("session_conflict", id);
    const release = unlock;
    const session = await repository.load(input.sessionId);
    if (!session) throw new AppError("session_complete", id);
    if (session.status !== "active") throw new AppError("session_complete", id);
    if (session.provider !== input.ai.provider || session.model !== input.ai.model) {
      throw new AppError("model_not_found", id);
    }

    // Câu hỏi **đã hỏi xong** — `COUNT(*) ... role = 'assistant'` (§8.2). Đếm câu trả
    // lời rồi suy ra là công thức lệch đúng một câu, và phiên ngắn sẽ hỏi tới câu 6.
    const asked = await repository.countQuestions(input.sessionId);
    if (asked >= session.questionsTotal) throw new AppError("session_complete", id);

    const adapter = getProviderAdapter(input.ai);
    const cv = await resolveCv(repository, session);
    const questionNumber = asked + 1;
    const sessionComplete = questionNumber >= session.questionsTotal;

    const meta: MetaFrame = {
      type: "meta",
      sessionId: session.id,
      questionNumber,
      questionsTotal: session.questionsTotal,
      mode: session.mode,
      language: session.language,
    };

    const produce = async (sink: FrameSink): Promise<TerminalFrame> => {
      try {
        sink(meta);
        // `seq` của lượt **đang viết** = `MAX(seq) + 1`; `appendExchange` tự kiểm lại
        // trong transaction, nên con số này chỉ là ý kiến, không phải niềm tin.
        const seq = (await repository.lastSeq(input.sessionId)) + 1;
        const result = await streamTurn(
          {
            auth,
            adapter,
            ai: input.ai,
            config: session.config,
            cv,
            history: toHistory(session.turns),
            newTurn: input.answer,
            requestId: id,
          },
          sink,
        );
        if (result.kind === "error") {
          // Lượt hỏng ⇒ không append. Client giữ phần delta đã thấy để tự thử lại
          // (§3.7): nội dung đó **chưa** có trong transcript.
          return errorTerminal(result, id);
        }
        await repository.appendExchange(input.sessionId, { role: "user", text: input.answer }, result.blocks, seq, id);
        return doneTerminal(result, sessionComplete);
      } finally {
        release();
      }
    };

    const response = turnStream(produce, id, request.signal);
    unlock = null; // `produce` sở hữu khoá cho tới khi ghi xong hoặc lỗi.
    return response;
  } catch (error) {
    unlock?.();
    return errorResponse(error);
  }
}

/**
 * CV của phiên, dựng lại ở lượt sau — §7.4.
 *
 * `start` đã xoá hàng `cv_uploads` sau khi dùng xong, nên phần lớn thời gian của một
 * phiên là lượt này lấy `cv_text` mà phiên đã giữ (FR-18). Đường đọc thẳng chỉ còn
 * khi hàng còn sống — tức là `start` vừa chạy, hoặc hàng chưa bị dọn.
 *
 * Không có nhánh "hết hàng rồi thì thử lại xem có còn": `file_id` mà không có hàng là
 * `null`, và `null` thì dùng text. Hỏi thêm một lần truy vấn để biết thứ mà `null`
 * đã nói rõ là thừa.
 */
async function resolveCv(
  repository: Awaited<ReturnType<typeof getRepository>>,
  session: SessionRecord,
): Promise<ResolvedCv> {
  const ref = await repository.loadCvRef(session.id);
  if (ref?.fileId) return { kind: "file", mode: "direct", fileId: ref.fileId };
  return session.cvText?.trim() ? { kind: "text", text: session.cvText } : { kind: "none" };
}

/**
 * `turns` từ DB → `TranscriptTurn` cho `buildMessages()`.
 *
 * `synthetic` **phải** được giữ lại: `buildMessages()` dùng nó để đặt lượt mở đầu ở
 * `messages[0]` và từ chối lịch sử không có nó. Bỏ dấu này thì mọi lượt sau ném lỗi bố
 * cục — và lỗi đó hiện ra sau khi đã stream vài trăm token.
 *
 * `buildCvBlocks()` không được gọi lại ở đây: lượt `user` mở đầu đã mang khối CV
 * **trong chính nó** (§7.1), nên dựng thêm khối CV ở lượt mới sẽ nhân đôi CV trong
 * prompt — tốn token, và trên Anthropic làm lệch tiền tố cache.
 */
function toHistory(turns: SessionRecord["turns"]): TranscriptTurn[] {
  return turns.map((turn): TranscriptTurn =>
    turn.role === "assistant"
      ? { role: "assistant", blocks: turn.blocks }
      : { role: "user", text: turn.text, ...("synthetic" in turn && turn.synthetic ? { synthetic: true as const } : {}) },
  );
}