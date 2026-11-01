import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ProfileSchema = z.object({
  label: z.string().min(1).max(80),
  jobTitle: z.string().min(1).max(120),
  seniority: z.enum(["junior", "mid", "senior", "lead"]).default("mid"),
  language: z.enum(["en", "vi"]).default("en"),
  questionKinds: z
    .array(z.enum(["concept", "design", "debug", "tradeoff", "behavioral"]))
    .min(1)
    .default(["concept", "design"]),
  focusSkills: z.array(z.string()).default([]),
  answerMode: z.enum(["text", "voice"]).default("text"),
  englishClarity: z.boolean().default(false),
});

/**
 * GET /api/interview/profiles — danh sách hồ sơ phỏng vấn (FR-MI-01).
 */
export async function GET(): Promise<Response> {
  const profiles = await prisma.interviewProfile.findMany({
    orderBy: { createdAt: "asc" },
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
      createdAt: true,
    },
  });

  return toResponse(ok({ profiles }));
}

/**
 * POST /api/interview/profiles — tạo hồ sơ phỏng vấn (FR-MI-01).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const input = parsed.data;

  const profile = await prisma.interviewProfile.create({
    data: {
      label: input.label,
      jobTitle: input.jobTitle,
      seniority: input.seniority,
      language: input.language,
      questionKinds: input.questionKinds.join(","),
      focusSkills: JSON.stringify(input.focusSkills),
      answerMode: input.answerMode,
      englishClarity: input.englishClarity,
    },
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

  return toResponse(ok(profile));
}
