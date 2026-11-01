import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import {
  buildInterviewSystemBlocks,
  buildProfileBlock,
  StartQuestionSchema,
} from "@/lib/interview-prompts";
import {
  parseQuestionKinds,
  parseSkillIds,
  parseSessionType,
} from "@/lib/interview";

export const dynamic = "force-dynamic";

const StartSchema = z.object({
  profileId: z.string().min(1),
  /** Số câu dự kiến (1..20). */
  plannedCount: z.number().int().min(1).max(20).default(8),
  /** Vì sao phiên này được đề xuất (C31). */
  focusHint: z.string().max(300).optional(),
  /** Loại phiên (C30). */
  sessionType: z.enum(["skill_drill", "interview_loop", "partner_sim"]).optional(),
});

/**
 * POST /api/interview/start — bắt đầu phiên phỏng vấn (FR-MI-02, FR-MI-03).
 *
 * ⚠️ FR-MI-11 — không có API key ⇒ nói rõ, KHÔNG giả lập interviewer.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"));
  }

  const profile = await prisma.interviewProfile.findUnique({
    where: { id: parsed.data.profileId },
    select: {
      id: true,
      label: true,
      jobTitle: true,
      seniority: true,
      language: true,
      questionKinds: true,
      focusSkills: true,
      answerMode: true,
      englishClarity: true,
    },
  });

  if (!profile) {
    return toResponse(fail("not_found", "Không tìm thấy hồ sơ phỏng vấn"));
  }

  // ⚠️ FR-MI-11 — không có key ⇒ KHÔNG giả lập interviewer.
  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Chưa có API key — không thể phỏng vấn với AI"),
    );
  }

  const sessionType =
    parsed.data.sessionType ?? parseSessionType("interview_loop");
  const questionKinds = parseQuestionKinds(profile.questionKinds);
  const focusSkills = parseSkillIds(profile.focusSkills);

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          buildProfileBlock({
            label: profile.label,
            jobTitle: profile.jobTitle,
            seniority: profile.seniority,
            language: profile.language,
            sessionType,
          }),
          `Loại câu hỏi được phép: ${questionKinds.join(", ")}`,
          focusSkills.length > 0
            ? `Kỹ năng cần nhắm tới: ${focusSkills.join(", ")}`
            : "",
          "Hãy bắt đầu phỏng vấn bằng 1 câu hỏi mở đầu.",
        ]
          .filter((line) => line.length > 0)
          .join("\n"),
      },
    ];

    const result = await callAIJson("AI-11", StartQuestionSchema, {
      system: buildInterviewSystemBlocks(),
      messages,
    });

    // Tạo phiên + lượt đầu tiên.
    const session = await prisma.interviewSession.create({
      data: {
        profileId: profile.id,
        plannedCount: parsed.data.plannedCount,
        askedCount: 1,
        status: "active",
        skillsFocused: JSON.stringify(focusSkills),
        questionKinds: questionKinds.join(","),
        answerMode: profile.answerMode,
        englishClarity: profile.englishClarity,
        sessionType,
        focusHint: parsed.data.focusHint ?? null,
      },
      select: { id: true, plannedCount: true, askedCount: true, status: true },
    });

    await prisma.interviewTurn.create({
      data: {
        sessionId: session.id,
        index: 0,
        question: result.data.question,
        kind: result.data.kind,
        skillId: result.data.skillId,
      },
    });

    return toResponse(
      ok({
        session,
        question: result.data,
      }),
    );
  } catch (error) {
    const aiError = toAiError(error);
    return toResponse(fail("ai_error", aiError.userMessage));
  }
}
