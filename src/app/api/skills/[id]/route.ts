import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { deleteSkill, getSkillDetail, resolveDepth } from "@/lib/skills";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills/[id] — chi tiết kỹ năng (FR-SK-05, FR-SK-12..FR-SK-15).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const detail = await getSkillDetail(id);
  if (!detail) {
    return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
  }

  // Breadcrumb: đường dẫn từ domain tới node (FR-SK-05).
  const path: Array<{ id: string; name: string }> = [];
  let currentId: string | null = id;

  while (currentId) {
    const row: { id: string; name: string; parentId: string | null } | null =
      await prisma.skill.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
    if (!row) break;
    path.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return toResponse(ok({ ...detail, path }));
}

const UpdateSkillSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  targetLevel: z.number().int().min(1).max(5).optional(),
  parentId: z.string().nullable().optional(),
});

/**
 * PATCH /api/skills/[id] — sửa node (FR-SK-04).
 *
 * ⚠️ **Không** cho sửa `level` — level chỉ tăng qua bằng chứng (FR-SK-03).
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

  const parsed = UpdateSkillSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const { name, targetLevel, parentId } = parsed.data;
  if (name === undefined && targetLevel === undefined && parentId === undefined) {
    return toResponse(fail("invalid_input", "Không có trường nào để sửa"));
  }

  const existing = await prisma.skill.findUnique({
    where: { id },
    select: { id: true, parentId: true },
  });
  if (!existing) {
    return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
  }

  // Đổi cha ⇒ không được đặt làm cha của chính nó hoặc của hậu duệ.
  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) {
      return toResponse(fail("invalid_input", "Không thể đặt làm cha của chính nó"));
    }

    const newParent = await prisma.skill.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!newParent) {
      return toResponse(fail("not_found", "parent_not_found: node cha không tồn tại"));
    }

    // ⚠️ Dùng cùng `resolveDepth` với `createSkill` — 2 đường phải có cùng
    // quy tắc tầng, không được mỗi đường tự kiểm.
    const parentDepth = await resolveDepth(parentId);
    if (parentDepth + 1 > 3) {
      return toResponse(fail("invalid_input", "max_depth_exceeded: cây chỉ có 3 tầng"));
    }
  }

  await prisma.skill.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(targetLevel !== undefined ? { targetLevel } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
  });

  const detail = await getSkillDetail(id);
  return toResponse(ok(detail));
}

/**
 * DELETE /api/skills/[id] — xoá node (FR-SK-11).
 *
 * Node con được **chuyển lên ông bà** (không mất dữ liệu); Evidence của node
 * bị xoá cascade theo schema.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  try {
    await deleteSkill(id);
    return toResponse(ok({ deleted: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "skill_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
    }
    throw error;
  }
}
