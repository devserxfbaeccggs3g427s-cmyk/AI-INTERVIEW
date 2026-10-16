/**
 * `POST /api/interviews/start` — T-2.7.
 *
 * Thứ tự các bước là phần cứng của endpoint này, không phải sở thích:
 *
 *   1. Đọc key → parse body → xác minh CV → nạp adapter. **Mọi lỗi ở đây trả JSON
 *      trước khi mở stream**, vì client mới xem được JSON. `callMode: "direct"` cũng
 *      bị chặn ở đây: nó không đi qua máy chủ này (FR-6, §10.2).
 *   2. Mở stream rồi mới ghi DB. Ngược lại, một lỗi ghi DB sẽ phải phát frame `error`
 *      trên một response đã khai báo là `text/event-stream`, và client đọc một 500
 *      JSON giữa dòng SSE là HTML rác.
 *
 * Phiên được tạo **trước** lúc gọi model vì `frame.meta` phải mang `sessionId` và
 * client cần nó để gửi `/turn` — nhưng cặp lượt mở đầu chỉ được ghi khi model đã trả
 * câu hỏi (`appendExchange`). Model hỏng thì không có lượt mồ côi; phiên rỗng bị dọn
 * trong `catch` của `produce`.
 */

import { purgeExpiredCvUploads } from "@/lib/cv-store";
import { getRepository } from "@/lib/db/repository";
import { AppError, errorResponse, readJson, requestId } from "@/lib/errors";
import { authFromRequest } from "@/lib/interviews/auth";
import { prepareCv } from "@/lib/interviews/cv";
import { openingInstruction } from "@/lib/interviews/opening";
import { getProviderAdapter } from "@/lib/providers/registry";
import { questionsTotal } from "@/lib/prompts";
import { startRequestSchema } from "@/lib/schemas";
import { turnStream } from "@/lib/sse";
import type { FrameSink, MetaFrame, TerminalFrame } from "@/lib/sse";
import { doneTerminal, errorTerminal, streamTurn } from "@/lib/stream-turn";

/** `seq` của lượt mở đầu: phiên vừa tạo nên chưa có lượt nào. */
const FIRST_SEQ = 0;

export async function POST(request: Request) {
  const id = requestId();
  const repository = await getRepository();

  try {
    const auth = authFromRequest(request, id);
    const input = startRequestSchema.parse(await readJson(request));
    if (input.ai.callMode !== "proxy") throw new AppError("unsupported_call_mode", id);

    const prepared = await prepareCv(input.cv, input.ai, auth, id);
    try {
      const adapter = getProviderAdapter(input.ai);

      const { id: sessionId } = await repository.create({
        config: input.config,
        ai: input.ai,
        cvText: prepared.text,
        cvUploadId: prepared.uploadId,
      });

      const meta: MetaFrame = {
        type: "meta",
        sessionId,
        questionNumber: 1,
        questionsTotal: questionsTotal(input.config.length),
        mode: input.config.mode,
        language: input.config.language,
      };
      const opening = openingInstruction(input.config.language);

      const produce = async (sink: FrameSink): Promise<TerminalFrame> => {
        try {
          sink(meta);
          const result = await streamTurn(
            { auth, adapter, ai: input.ai, config: input.config, cv: prepared.cv, history: [], newTurn: opening, requestId: id },
            sink,
          );
          if (result.kind === "error") {
            // Lượt hỏng ⇒ không append; xoá phiên rỗng để không còn bản ghi mồ côi.
            await repository.delete(sessionId);
            return errorTerminal(result, id);
          }
          // Cặp mở đầu gộp trong một transaction, `seq` = 0 và 1. Lượt `user` mở đầu
          // không phải câu hỏi nên `countQuestions()` không đếm nó (§8.2).
          await repository.appendExchange(
            sessionId,
            { role: "user", text: opening, synthetic: true },
            result.blocks,
            FIRST_SEQ,
            id,
          );
          return doneTerminal(result, false);
        } catch (error) {
          // Ghi lượt hỏng lỗi ⇒ dọn phiên rỗng, nếu không thì mỗi lần thử lại với key
          // hỏng để lại một phiên không lượt nào trong danh sách phiên.
          await repository.delete(sessionId).catch(() => {});
          throw error;
        } finally {
          // Hàng CV đã dùng xong thì xoá; phiên giữ `cv_text` và `cv_upload_id`.
          prepared.release();
        }
      };

      return turnStream(produce, id, request.signal);
    } catch (error) {
      // Lỗi giữa lúc xác minh CV và lúc mở stream: vẫn chưa có stream nào mở.
      prepared.release();
      throw error;
    }
  } catch (error) {
    // Dọn hàng CV hết hạn ở lỗi chứ không ở thành công: đây là nhánh chạm vào DB nhiều
    // nhất, và bảng `cv_uploads` không có cron. Chạy **không** `await` — nó không
    // thuộc vào câu trả lời này, và chặn nó là thêm độ trễ cho một việc dọn dẹp.
    void Promise.resolve(purgeExpiredCvUploads()).catch(() => {});
    return errorResponse(error);
  }
}