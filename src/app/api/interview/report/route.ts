/**
 * `POST /api/interview/report` — AI-13: báo cáo cuối phiên (tasks.md 13.12).
 *
 * Request:
 *   { sessionId: string }
 *
 * Response:
 *   { ok: true, data: { report: InterviewReport, activityId: string } }
 *   | { ok: false, error: { code, message } }
 *
 * Logic:
 *   1. Load session with all turns
 *   2. Build matrix of scores per kind per criterion
 *   3. Call AI (mock_interview_report) to generate:
 *      - 3 điểm mạnh (kèm trích dẫn nguyên văn câu trả lời)
 *      - 3 điểm yếu (kèm số câu / dạng câu)
 *      - Đề xuất luyện tập (skill + dạng câu)
 *   4. Create Activity (type=mock_interview) with aiScore = overall average
 *   5. Return report + activityId
 *
 * Xem tasks.md 13.12 / 13.13 · design.md §4.18 · FR-MI-05/06/07.
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
});

/** Schema structured output cho báo cáo cuối phiên. */
const ReportSchema = z.object({
  strengths: z.array(
    z.object({
      title: z.string().max(80),
      evidence: z.string().max(300), // trích dẫn nguyên văn
      criterion: z.string(), // tiêu chí liên quan
      kind: z.string(), // dạng câu
    }),
  ).length(3),
  weaknesses: z.array(
    z.object({
      title: z.string().max(80),
      evidence: z.string().max(300), // mô tả + số câu
      criterion: z.string(),
      kind: z.string(),
      suggestion: z.string().max(200), // đề xuất cụ thể
    }),
  ).length(3),
  practicePlan: z.array(
    z.object({
      skill: z.string(),
      kind: z.enum(["concept", "design", "debug", "tradeoff", "behavioral"]),
      reason: z.string().max(200),
    }),
  ).min(1).max(3),
  summary: z.string().max(500), // tóm tắt 2-3 câu
});

type ReportResult = z.infer<typeof ReportSchema>;

function getRubric(kind: string): readonly RubricCriterion[] {
  return kind === "behavioral" ? RUBRIC_COMMUNICATION : RUBRIC_TECHNICAL;
}

function getCriterionKeys(kind: string): readonly string[] {
  return kind === "behavioral"
    ? (["clarity", "structure", "tone", "natural", "grammar"] as const)
    : (["accuracy", "depth", "reasoning", "communication", "tradeoff"] as const);
}

export async function POST(req: Request) {
  let body: z.infer<typeof RequestBody>;

  try {
    const json = await req.json();
    body = RequestBody.parse(json);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const err = e as z.ZodError;
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: err.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  // Load session with all turns
  const session = await prisma.interviewSession.findUnique({
    where: { id: body.sessionId },
    include: {
      turns: { orderBy: { index: "asc" } },
      profile: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Phiên không tồn tại" } },
      { status: 404 },
    );
  }

  if (session.status !== "done") {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_STATE", message: "Phiên chưa kết thúc" } },
      { status: 400 },
    );
  }

  const answeredTurns = session.turns.filter((t) => t.answer && t.scores);
  if (answeredTurns.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "NO_DATA", message: "Không có câu trả lời để chấm" } },
      { status: 400 },
    );
  }

  // Build matrix for AI context
  const matrix: Record<string, Record<string, { score: number; note?: string }>> = {};
  const kindCounts: Record<string, number> = {};
  let totalScoreSum = 0;
  let totalScoreCount = 0;

  for (const turn of answeredTurns) {
    if (!matrix[turn.kind]) matrix[turn.kind] = {};
    kindCounts[turn.kind] = (kindCounts[turn.kind] || 0) + 1;
    const kindMatrix = matrix[turn.kind]!; // Non-null after initialization above

    const scores = turn.scores as Record<string, { score: number; note?: string }>;
    for (const [criterion, data] of Object.entries(scores)) {
      if (!kindMatrix[criterion]) {
        kindMatrix[criterion] = { score: 0, note: "" };
      }
      // Average across turns of same kind
      const existing = kindMatrix[criterion];
      const count = kindCounts[turn.kind] ?? 1;
      existing.score = (existing.score * (count - 1) + data.score) / count;
      if (data.note) existing.note = data.note; // keep latest note
    }

    if (turn.total !== null && turn.total !== undefined) {
      totalScoreSum += turn.total;
      totalScoreCount++;
    }
  }

  const overallScore = totalScoreCount > 0 ? totalScoreSum / totalScoreCount : 0;
  const kindsPresent = Object.keys(matrix);

  // Build prompt for AI-13
  const systemPrompt = [
    "Bạn là cố vấn phỏng vấn, viết báo cáo cuối phiên dựa trên ma trận điểm 5 tiêu chí.",
    "Trả về JSON đúng schema: strengths[3], weaknesses[3], practicePlan[1-3], summary.",
    "Strengths: 3 điểm mạnh, mỗi cái có title, evidence (trích dẫn nguyên văn câu trả lời), criterion, kind.",
    "Weaknesses: 3 điểm yếu, mỗi cái có title, evidence (mô tả + số câu), criterion, kind, suggestion (đề xuất cụ thể).",
    "PracticePlan: 1-3 gợi ý luyện tập (skill + kind + reason).",
    "Summary: tóm tắt 2-3 câu, khách quan, xây dựng.",
    "Không thêm chú thích ngoài JSON.",
  ].join("\n");

  // Build evidence text for AI
  const evidenceLines: string[] = [];
  for (const turn of answeredTurns) {
    if (turn.answer) {
      evidenceLines.push(`[Câu ${turn.index + 1} · ${turn.kind}${turn.skillName ? ` · ${turn.skillName}` : ""}] ${turn.answer.slice(0, 300)}`);
    }
  }

  const matrixText = kindsPresent.map((kind) => {
    const keys = getCriterionKeys(kind);
    const rubric = getRubric(kind);
    const lines = [`${kind.toUpperCase()} (${kindCounts[kind]} câu):`];
    for (const key of keys) {
      const criterion = rubric.find((c) => c.key === key);
      const kindMatrix = matrix[kind];
      const data = kindMatrix ? kindMatrix[key] : undefined;
      if (data) {
        lines.push(`  - ${criterion?.name || key}: ${data.score.toFixed(1)}/5${data.note ? ` (${data.note})` : ""}`);
      }
    }
    return lines.join("\n");
  }).join("\n\n");

  const userPrompt = [
    `Hồ sơ: ${session.profile.jobTitle} (${session.profile.seniority})`,
    `Ngôn ngữ: ${session.profile.language === "vi" ? "Tiếng Việt" : "Tiếng Anh"}`,
    `Tổng câu hỏi: ${answeredTurns.length} / ${session.plannedCount}`,
    `Điểm tổng trung bình: ${overallScore.toFixed(1)}/5.0`,
    "",
    "MA TRẬN ĐIỂM CHI TIẾT:",
    matrixText,
    "",
    "NỘI DUNG CÂU TRẢ LỜI (trích dẫn):",
    evidenceLines.join("\n\n"),
    "",
    "YÊU CẦU:",
    "1. Xác định 3 điểm mạnh nhất — dùng evidence TRÍCH DẪN NGUYÊN VĂN từ câu trả lời.",
    "2. Xác định 3 điểm yếu nhất — dùng evidence MÔ TẢ + SỐ CÂU (ví dụ: 'Câu 2,4: thiếu chiều sâu reasoning').",
    "3. Đề xuất 1-3 kế hoạch luyện tập cụ thể (skill + dạng câu + lý do).",
    "4. Tóm tắt 2-3 câu.",
    "Lưu ý: strengths/weaknesses PHẢI đúng 3 mục. Nếu dữ liệu ít, hãy gom nhóm hợp lý.",
  ].join("\n");

  // Call AI-13 (mock_interview_report) - anthropic provider
  const aiResult: AiEnvelope<ReportResult> = await callAi("mock_interview_report", {
    system: systemPrompt,
    user: userPrompt,
    schema: ReportSchema,
  });

  if (!aiResult.ok) {
    return NextResponse.json(
      { ok: false, error: aiResult.error },
      { status: 502 },
    );
  }

  const report = aiResult.data;

  // Create Activity for this interview session
  const activity = await prisma.activity.create({
    data: {
      skillId: null, // interview is cross-skill
      domain: "communication",
      type: "mock_interview",
      minutes: Math.round((answeredTurns.length * 5)), // estimate 5 min per question
      title: `Mock Interview: ${session.profile.jobTitle} (${session.profile.seniority})`,
      content: JSON.stringify({
        sessionId: session.id,
        questionCount: answeredTurns.length,
        overallScore,
        kindsPresent,
        report,
      }),
      quality: Math.round(overallScore), // 1-5
      aiScore: overallScore,
    },
  });

  // Update session with totalScore
  await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      totalScore: overallScore,
      activityId: activity.id,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      report: {
        ...report,
        overallScore,
        questionCount: answeredTurns.length,
        kindsPresent,
        matrix,
        delta: null, // TODO: compute delta vs previous session
      },
      activityId: activity.id,
    },
  });
}