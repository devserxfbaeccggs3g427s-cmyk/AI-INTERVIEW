import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { AiError } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import { gradeOpenItem } from "@/lib/test-ai";
import { averageRubric, type ItemType } from "@/lib/test";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GradeSchema = z.object({
  testId: z.string().min(1),
  index: z.number().int().min(0),
});

/**
 * POST /api/test/grade-open — AI-15: chấm câu tự luận theo 4 nhóm lỗi.
 *
 * ⚠️ AC-12: AI trả nhóm lạ ⇒ schema strict fail ⇒ `502`, **không** ghi
 * `errorGroups` và không tính vào điểm tổng.
 * ⚠️ Điểm do **code** tính = trung bình 4 nhóm (không tin tổng của AI).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = GradeSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "testId và index không hợp lệ"));
  }

  const { testId, index } = parsed.data;

  const session = await prisma.testSession.findUnique({
    where: { id: testId },
    select: { id: true, lang: true },
  });
  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên kiểm tra"));
  }

  const item = await prisma.testItem.findUnique({
    where: { testId_index: { testId, index } },
    select: {
      id: true,
      itemType: true,
      prompt: true,
      answer: true,
      userAnswer: true,
      rubric: true,
      scored: true,
    },
  });
  if (!item) {
    return toResponse(fail("not_found", "Chỉ số câu không tồn tại"));
  }

  if (item.scored && item.rubric) {
    return toResponse(fail("conflict", "Câu này đã được chấm"));
  }

  const userAnswer = (item.userAnswer ?? "").trim();
  if (!userAnswer) {
    return toResponse(fail("invalid_input", "Chưa có câu trả lời để chấm"));
  }

  try {
    const graded = await gradeOpenItem({
      lang: session.lang,
      itemType: item.itemType as ItemType,
      prompt: item.prompt,
      reference: item.answer,
      userAnswer,
    });

    const score = Math.round(averageRubric(graded.rubric) * 100) / 100;
    const isCorrect = score >= 6;

    await prisma.testItem.update({
      where: { id: item.id },
      data: {
        rubric: graded.rubric as unknown as object,
        errorGroups: graded.errors as unknown as object,
        notes: graded.feedback,
        explanation: graded.correctedAnswer,
        isCorrect,
        scored: true,
      },
    });

    return toResponse(
      ok({
        index,
        rubric: graded.rubric,
        score,
        isCorrect,
        errors: graded.errors,
        feedback: graded.feedback,
        correctedAnswer: graded.correctedAnswer,
      }),
    );
  } catch (error) {
    if (error instanceof AiError) {
      // `AiSchemaError` cũng là `AiError` ⇒ 502, không ghi errorGroups.
      return toResponse(fail("ai_error", error.userMessage));
    }
    return toResponse(
      fail("unknown", error instanceof Error ? error.message : "Không chấm được câu này"),
    );
  }
}
