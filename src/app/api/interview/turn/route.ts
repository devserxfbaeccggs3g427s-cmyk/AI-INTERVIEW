import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import {
  buildInterviewSystemBlocks,
  buildProfileBlock,
  TurnResultSchema,
} from "@/lib/interview-prompts";
import { parseSessionType } from "@/lib/interview";

export const dynamic = "force-dynamic";

const TurnSchema = z.object({
  sessionId: z.string().min(1),
  /** Index của lượt đang trả lời. */
  index: z.number().int().min(0),
  /** Câu trả lời của người dùng. */
  answer: z.string().min(1).max(10_000),
});

/**
 * POST /api/interview/turn — trả lời 1 lượt, AI chấm + sinh câu tiếp theo.
 *
 * ⚠️ FR-MI-05 — mỗi lượt được chấm theo rubric chi tiết (không chỉ điểm tổng).
 * ⚠️ FR-MI-11 — không có key ⇒ KHÔNG giả lập phản hồi chấm.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = TurnSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"));
  }

  const { sessionId, index, answer } = parsed.data;

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      profileId: true,
      plannedCount: true,
      askedCount: true,
      status: true,
      questionKinds: true,
      sessionType: true,
      profile: {
        select: {
          label: true,
          jobTitle: true,
          seniority: true,
          language: true,
        },
      },
    },
  });

  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên phỏng vấn"));
  }

  if (session.status !== "active") {
    return toResponse(fail("conflict", "Phiên đã kết thúc"));
  }

  const turn = await prisma.interviewTurn.findFirst({
    where: { sessionId, index },
    select: { id: true, question: true, kind: true, skillId: true },
  });

  if (!turn) {
    return toResponse(fail("not_found", "Không tìm thấy lượt phỏng vấn"));
  }

  // ⚠️ FR-MI-11 — không có key ⇒ KHÔNG giả lập chấm điểm.
  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Chưa có API key — không thể chấm điểm phỏng vấn"),
    );
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          buildProfileBlock({
            label: session.profile.label,
            jobTitle: session.profile.jobTitle,
            seniority: session.profile.seniority,
            language: session.profile.language,
            sessionType: parseSessionType(session.sessionType),
          }),
          `CÂU HỎI (${turn.kind}): ${turn.question}`,
          "",
          "TRẢ LỜI CỦA ỨNG VIÊN:",
          answer,
        ].join("\n"),
      },
    ];

    const result = await callAIJson("AI-12", TurnResultSchema, {
      system: buildInterviewSystemBlocks(),
      messages,
    });

    // Lưu lượt + điểm.
    await prisma.interviewTurn.update({
      where: { id: turn.id },
      data: {
        answer,
        scores: result.data.scores as unknown as object,
        behavioralScores:
          (result.data.behavioralScores as unknown as object) ?? undefined,
        total: result.data.total,
        feedback: result.data.feedback,
        nextQuestion: result.data.nextQuestion
          ? JSON.stringify(result.data.nextQuestion)
          : null,
      },
    });

    // Câu tiếp theo (nếu còn trong kế hoạch).
    const nextIndex = index + 1;
    let nextTurnCreated = false;

    if (
      result.data.nextQuestion &&
      nextIndex < session.plannedCount
    ) {
      await prisma.interviewTurn.create({
        data: {
          sessionId,
          index: nextIndex,
          question: result.data.nextQuestion.question,
          kind: result.data.nextQuestion.kind,
          skillId: result.data.nextQuestion.skillId,
        },
      });
      nextTurnCreated = true;
    }

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        askedCount: nextTurnCreated ? nextIndex + 1 : nextIndex,
        status: nextTurnCreated ? "active" : "done",
        endedAt: nextTurnCreated ? null : new Date(),
        totalScore: result.data.total,
      },
    });

    return toResponse(
      ok({
        scores: result.data.scores,
        behavioralScores: result.data.behavioralScores,
        total: result.data.total,
        feedback: result.data.feedback,
        nextQuestion: result.data.nextQuestion,
        sessionDone: !nextTurnCreated,
      }),
    );
  } catch (error) {
    const aiError = toAiError(error);
    return toResponse(fail("ai_error", aiError.userMessage));
  }
}
