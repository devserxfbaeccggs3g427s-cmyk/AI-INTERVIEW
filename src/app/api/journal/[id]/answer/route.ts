import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { saveJournalAnswer } from "@/lib/journal";

export const dynamic = "force-dynamic";

const AnswerSchema = z.object({ answer: z.string().min(1).max(2000) });

/**
 * POST /api/journal/[id]/answer — ghi câu trả lời cho câu hỏi sắc (FR-PSJ-10).
 *
 * ⚠️ Lưu vào `Reflection` — KHÔNG tạo `Activity` mới.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = AnswerSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "Câu trả lời không được rỗng"));
  }

  try {
    const entry = await saveJournalAnswer({
      reflectionId: id,
      answer: parsed.data.answer,
    });
    return toResponse(ok(entry));
  } catch (error) {
    if (error instanceof Error && error.message === "journal_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục nhật ký"));
    }
    if (error instanceof Error && error.message === "no_feedback_to_answer") {
      return toResponse(fail("conflict", "Chưa có phản hồi AI để trả lời"));
    }
    throw error;
  }
}
