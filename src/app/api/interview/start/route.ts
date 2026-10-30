/**
 * `POST /api/interview/start` — tạo `InterviewSession` trước khi hiện câu hỏi (tasks.md 13.4).
 *
 * Request:
 *   {
 *     profileId: string,
 *     questionCount: number,
 *     responseMode: "text" | "voice",
 *     language: "vi" | "en",
 *     questionKinds: string[],
 *     advancedOptions: { followUpDepth, timePerQuestion, strictScoring }
 *   }
 *
 * Response:
 *   { ok: true, data: { sessionId: string } }
 *   | { ok: false, error: { code, message } }
 *
 * Xem tasks.md 13.4 / 13.5 · design.md §4.17 · FR-MI-01.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { callAi } from "@/lib/ai/router";
import type { AiEnvelope } from "@/lib/types";

export const dynamic = "force-dynamic";

const AdvancedOptionsSchema = z.object({
  followUpDepth: z.number().int().min(0).max(3).default(2),
  timePerQuestion: z.number().int().min(60).max(600).default(300),
  strictScoring: z.boolean().default(false),
});

const RequestBody = z.object({
  profileId: z.string().min(1),
  questionCount: z.number().int().min(5).max(12),
  responseMode: z.enum(["text", "voice"]).default("text"),
  language: z.enum(["vi", "en"]).default("vi"),
  questionKinds: z.array(z.string()).min(1).max(5),
  advancedOptions: AdvancedOptionsSchema.optional(),
});

/** Schema structured output cho câu hỏi đầu tiên (AI-11). */
const FirstQuestionSchema = z.object({
  question: z.string().min(10).max(500),
  kind: z.enum(["concept", "design", "debug", "tradeoff", "behavioral"]),
  skillName: z.string().nullable(),
  reasoning: z.string().max(200).optional(),
});

type FirstQuestion = z.infer<typeof FirstQuestionSchema>;

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

  // Verify profile exists
  const profile = await prisma.interviewProfile.findUnique({
    where: { id: body.profileId },
  });

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Hồ sơ không tồn tại" } },
      { status: 404 },
    );
  }

  // Parse focus skills from profile
  let focusSkills: string[] = [];
  try {
    focusSkills = JSON.parse(profile.focusSkills);
  } catch {
    focusSkills = [];
  }

  // Create interview session
  const session = await prisma.interviewSession.create({
    data: {
      profileId: body.profileId,
      plannedCount: body.questionCount,
      askedCount: 0,
      status: "active",
      skillsFocused: JSON.stringify(focusSkills),
    },
  });

  // Build prompt for first question (AI-11: mock_interview)
  const kindLabels: Record<string, string> = {
    concept: "Khái niệm cơ bản",
    design: "Thiết kế hệ thống / Kiến trúc",
    debug: "Debug / Troubleshooting thực tế",
    tradeoff: "Đánh đổi kỹ thuật (Trade-off)",
    behavioral: "Hành vi / Situational (STAR)",
  };

  const kindsDesc = body.questionKinds.map((k) => `- ${kindLabels[k] || k}`).join("\n");

  const systemPrompt = [
    "Bạn là người phỏng vấn viên chuyên nghiệp, tạo câu hỏi phỏng vấn kỹ thuật / quản trị.",
    "Câu hỏi phải: mở đầu, đi sâu dần, hỏi về hành vi cụ thể (STAR cho behavioral).",
    "Trả về JSON đúng schema: question, kind, skillName (nullable), reasoning (optional).",
    "Không thêm chú thích ngoài JSON.",
  ].join("\n");

  const userPrompt = [
    `Hồ sơ ứng viên:`,
    `- Vị trí: ${profile.jobTitle}`,
    `- Cấp bậc: ${profile.seniority}`,
    `- Ngôn ngữ: ${body.language === "vi" ? "Tiếng Việt" : "Tiếng Anh"}`,
    `- Dạng câu hỏi cho phép:\n${kindsDesc}`,
    `- Skills focus: ${focusSkills.length > 0 ? focusSkills.join(", ") : "(tự động chọn từ điểm yếu)"}`,
    "",
    "Yêu cầu: Sinh câu hỏi MỞ ĐẦU phù hợp hồ sơ. Câu hỏi phải:",
    "1. Đúng 1 trong các dạng cho phép",
    "2. Phù hợp cấp bậc (Senior/Staff/Manager → sâu, hệ thống; Junior → nền tảng)",
    "3. Mở rộng để ứng viên kể về kinh nghiệm thực tế",
    "4. Có skillName nếu gắn với skill cụ thể, null nếu câu hỏi tổng quát",
  ].join("\n");

  // Call AI-11 (mock_interview) - anthropic provider
  const aiResult: AiEnvelope<FirstQuestion> = await callAi("mock_interview", {
    system: systemPrompt,
    user: userPrompt,
    schema: FirstQuestionSchema,
  });

  if (!aiResult.ok) {
    // Cleanup session on AI failure
    await prisma.interviewSession.delete({ where: { id: session.id } });
    return NextResponse.json(
      { ok: false, error: aiResult.error },
      { status: 502 },
    );
  }

  const firstQuestion = aiResult.data;

  // Create first turn with the question
  await prisma.interviewTurn.create({
    data: {
      sessionId: session.id,
      index: 0,
      question: firstQuestion.question,
      kind: firstQuestion.kind,
      skillName: firstQuestion.skillName,
    },
  });

  // Update session askedCount
  await prisma.interviewSession.update({
    where: { id: session.id },
    data: { askedCount: 1 },
  });

  return NextResponse.json({
    ok: true,
    data: {
      sessionId: session.id,
      firstQuestion: {
        index: 0,
        question: firstQuestion.question,
        kind: firstQuestion.kind,
        skillName: firstQuestion.skillName,
      },
    },
  });
}