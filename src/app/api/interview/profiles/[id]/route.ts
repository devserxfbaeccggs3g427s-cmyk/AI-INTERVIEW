import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  jobTitle: z.string().min(1).max(120).optional(),
  seniority: z.enum(["junior", "mid", "senior", "lead"]).optional(),
  language: z.enum(["en", "zh", "vi"]).optional(),
  questionKinds: z
    .array(z.enum(["concept", "design", "debug", "tradeoff", "behavioral"]))
    .min(1)
    .optional(),
  focusSkills: z.array(z.string()).optional(),
  answerMode: z.enum(["text", "voice"]).optional(),
  englishClarity: z.boolean().optional(),
});

/**
 * GET /api/interview/profiles/[id] — đọc 1 hồ sơ.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const profile = await prisma.interviewProfile.findUnique({
    where: { id },
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
    return toResponse(fail("not_found", "Không tìm thấy hồ sơ"));
  }

  return toResponse(ok(profile));
}

/**
 * PATCH /api/interview/profiles/[id] — sửa hồ sơ.
 */
export async function PATCH(
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"));
  }

  const input = parsed.data;

  const profile = await prisma.interviewProfile.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.seniority !== undefined ? { seniority: input.seniority } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.questionKinds !== undefined
        ? { questionKinds: input.questionKinds.join(",") }
        : {}),
      ...(input.focusSkills !== undefined
        ? { focusSkills: JSON.stringify(input.focusSkills) }
        : {}),
      ...(input.answerMode !== undefined ? { answerMode: input.answerMode } : {}),
      ...(input.englishClarity !== undefined
        ? { englishClarity: input.englishClarity }
        : {}),
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

/**
 * DELETE /api/interview/profiles/[id] — xoá hồ sơ + các phiên của nó.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  await prisma.interviewProfile.deleteMany({ where: { id } });

  return toResponse(ok({ deleted: true }));
}
