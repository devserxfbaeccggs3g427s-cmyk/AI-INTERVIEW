/**
 * `POST /api/interview/turn` — AI-12: 1 call chấm + trả lời + sinh câu tiếp theo (tasks.md 13.8).
 *
 * Request:
 *   { sessionId: string, turnIndex: number, answer: string }
 *
 * Response:
 *   { ok: true, data: { turn: InterviewTurn, nextQuestion?: string, isComplete: boolean } }
 *   | { ok: false, error: { code, message } }
 *
 * Logic:
 *   1. Load session + turn
 *   2. Determine rubric based on question kind
 *   3. Call AI (mock_interview_turn) to score 5 criteria + feedback + next question
 *   4. Save InterviewTurn with scores JSON
 *   5. If not last question, generate next question via AI-19 (local) or include in same call
 *   6. Return updated turn + next question
 *
 * Xem tasks.md 13.8 / 13.9 / 13.9a · design.md §4.17 · FR-MI-02/03/04.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { callAi } from "@/lib/ai/router";
import { RUBRIC_TECHNICAL, RUBRIC_COMMUNICATION, type RubricCriterion } from "@/lib/rubrics";
import type { AiEnvelope } from "@/lib/types";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  sessionId: z.string().min(1),
  turnIndex: z.number().int().min(0),
  answer: z.string().min(1).max(10000),
});

/** Schema structured output cho chấm điểm + câu tiếp theo. */
const TurnResultSchema = z.object({
  scores: z.record(
    z.string(),
    z.object({
      score: z.number().min(0).max(5),
      note: z.string().max(200).optional(),
    }),
  ),
  total: z.number().min(0).max(5),
  feedback: z.string().max(500),
  nextQuestion: z.string().max(500).nullable(),
  nextKind: z.enum(["concept", "design", "debug", "tradeoff", "behavioral"]).nullable(),
  nextSkillName: z.string().nullable(),
  reasoning: z.string().max(300).optional(),
});

type TurnResult = z.infer<typeof TurnResultSchema>;

// Map kind to rubric
function getRubric(kind: string): readonly RubricCriterion[] {
  if (kind === "behavioral") return RUBRIC_COMMUNICATION;
  return RUBRIC_TECHNICAL;
}

function getRubricName(kind: string): "technical" | "communication" {
  return kind === "behavioral" ? "communication" : "technical";
}

function buildRubricPrompt(rubric: readonly RubricCriterion[]): string {
  return rubric
    .map(
      (c) =>
        `- ${c.key}: ${c.name} — ${c.desc} (0–5, cho điểm + 1 câu nhận xét ngắn)`,
    )
    .join("\n");
}

export async function POST(req: Request) {
  let body: z.infer<typeof RequestBody>;

  try {
    const json = await req.json();
    body = RequestBody.parse(json);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: e.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  // Load session and turn
  const session = await prisma.interviewSession.findUnique({
    where: { id: body.sessionId },
    include: { turns: true, profile: true },
  });

  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Phiên không tồn tại" } },
      { status: 404 },
    );
  }

  const turn = session.turns.find((t) => t.index === body.turnIndex);
  if (!turn) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Câu hỏi không tồn tại" } },
      { status: 404 },
    );
  }

  if (turn.answer) {
    return NextResponse.json(
      { ok: false, error: { code: "CONFLICT", message: "Câu này đã được trả lời" } },
      { status: 409 },
    );
  }

  const rubric = getRubric(turn.kind);
  const rubricName = getRubricName(turn.kind);
  const isLastQuestion = turn.index >= session.plannedCount - 1;

  // Build system prompt for scoring
  const systemPrompt = [
    "Bạn là giám khảo phỏng vấn chuyên nghiệp. Chấm điểm câu trả lời theo rubric 5 tiêu chí.",
    "Trả về JSON đúng schema: scores (5 tiêu chí), total (trung bình), feedback, nextQuestion/nextKind/nextSkillName.",
    "Mỗi tiêu chí: score (0-5), note (1 câu nhận xét).",
    "Feedback: 2-3 câu, cụ thể, xây dựng, chỉ ra mạnh/yếu.",
    isLastQuestion
      ? "Đây là câu CUỐI CÙNG — nextQuestion=null, nextKind=null, nextSkillName=null."
      : "Sinh câu hỏi TIẾP THEO (follow-up hoặc câu mới) phù hợp ngữ cảnh.",
    "Không thêm chú thích ngoài JSON.",
  ].join("\n");

  const rubricPrompt = buildRubricPrompt(rubric);

  const userPrompt = [
    `Hồ sơ: ${session.profile.jobTitle} (${session.profile.seniority})`,
    `Ngôn ngữ: ${session.profile.language === "vi" ? "Tiếng Việt" : "Tiếng Anh"}`,
    `Câu hỏi (${turn.kind}${turn.skillName ? ` · ${turn.skillName}` : ""}):`,
    turn.question,
    "",
    `Câu trả lời ứng viên:`,
    body.answer,
    "",
    `Rubric chấm điểm (${rubricName}):`,
    rubricPrompt,
    "",
    isLastQuestion
      ? "YÊU CẦU: Chấm điểm câu cuối. nextQuestion=null, nextKind=null, nextSkillName=null."
      : "YÊU CẦU: Chấm điểm + sinh câu hỏi TIẾP THEO.",
    !isLastQuestion
      ? "Quy tắc câu tiếp theo:"
      : "",
    !isLastQuestion
      ? "- Nếu câu trả lời hời hợt/chưa sâu → follow-up đi sâu hơn (cùng kind, cùng skill)"
      : "",
    !isLastQuestion
      ? "- Nếu câu trả lời đã tốt → câu mới (xoay kind/skill theo phân bổ đều)"
      : "",
    !isLastQuestion
      ? "- Câu tiếp theo phải khó dần, phù hợp cấp bậc"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Call AI-12 (mock_interview_turn) - anthropic provider
  const aiResult: AiEnvelope<TurnResult> = await callAi("mock_interview_turn", {
    system: systemPrompt,
    user: userPrompt,
    schema: TurnResultSchema,
  });

  if (!aiResult.ok) {
    return NextResponse.json(
      { ok: false, error: aiResult.error },
      { status: 502 },
    );
  }

  const result = aiResult.data;

  // Validate scores contain all 5 criteria
  const expectedKeys = rubric.map((c) => c.key);
  const missingKeys = expectedKeys.filter((k) => !(k in result.scores));
  if (missingKeys.length > 0) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_ERROR", message: `Thiếu tiêu chí: ${missingKeys.join(", ")}` } },
      { status: 502 },
    );
  }

  // Update turn with scores and answer
  const updatedTurn = await prisma.interviewTurn.update({
    where: { id: turn.id },
    data: {
      answer: body.answer,
      scores: result.scores,
      total: result.total,
      feedback: result.feedback,
      nextQuestion: result.nextQuestion,
    },
  });

  // If not last question and has next question, create next turn
  let nextTurn: typeof turn | null = null;
  if (!isLastQuestion && result.nextQuestion) {
    nextTurn = await prisma.interviewTurn.create({
      data: {
        sessionId: session.id,
        index: turn.index + 1,
        question: result.nextQuestion,
        kind: result.nextKind || turn.kind,
        skillName: result.nextSkillName,
      },
    });

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { askedCount: { increment: 1 } },
    });
  } else if (isLastQuestion) {
    // Mark session as done
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { status: "done", endedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      turn: {
        ...updatedTurn,
        scores: result.scores,
      },
      nextQuestion: nextTurn
        ? {
            index: nextTurn.index,
            question: nextTurn.question,
            kind: nextTurn.kind,
            skillName: nextTurn.skillName,
          }
        : null,
      isComplete: isLastQuestion,
    },
  });
}