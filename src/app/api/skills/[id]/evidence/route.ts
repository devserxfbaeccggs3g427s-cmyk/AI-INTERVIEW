import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getSkillDetail, recordEvidence } from "@/lib/skills";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills/[id]/evidence — nhật ký bằng chứng có phân trang (FR-SK-05).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

  const skill = await prisma.skill.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!skill) {
    return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
  }

  const detail = await getSkillDetail(id, limit);

  return toResponse(
    ok({
      items: detail?.evidence ?? [],
      total: detail?.evidenceTotal ?? 0,
      page,
      limit,
      hasMore: page * limit < (detail?.evidenceTotal ?? 0),
    }),
  );
}

const RecordEvidenceSchema = z.object({
  activityId: z.string().min(1),
  rating: z.number().int().min(1).max(4),
});

/**
 * POST /api/skills/[id]/evidence — **đường ghi bằng chứng duy nhất** (task §11).
 *
 * Sau khi ghi, level của kỹ năng VÀ node tổ tiên được tính lại (FR-SK-03).
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

  const parsed = RecordEvidenceSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const skill = await prisma.skill.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!skill) {
    return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
  }

  const activity = await prisma.activity.findUnique({
    where: { id: parsed.data.activityId },
    select: { id: true },
  });
  if (!activity) {
    return toResponse(fail("not_found", "Không tìm thấy hoạt động"));
  }

  // Không ghi trùng cặp (activityId, skillId).
  const existing = await prisma.evidence.findFirst({
    where: { activityId: parsed.data.activityId, skillId: id },
    select: { id: true },
  });
  if (existing) {
    return toResponse(fail("conflict", "Bằng chứng cho hoạt động này đã tồn tại"));
  }

  const result = await recordEvidence({
    skillId: id,
    activityId: parsed.data.activityId,
    rating: parsed.data.rating,
  });

  return toResponse(ok(result));
}
