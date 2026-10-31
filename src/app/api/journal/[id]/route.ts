import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { classifyJournalLocal, commitJournal, deleteDraft } from "@/lib/journal";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  /** Hành động: `commit` (thành hoạt động) hoặc `classify` (phân loại cục bộ). */
  action: z.enum(["commit", "classify"]),
  /** Skill được gán (khi commit). */
  skillId: z.string().nullable().optional(),
});

/**
 * PATCH /api/journal/[id] — commit nhật ký hoặc phân loại cục bộ.
 *
 * ⚠️ P3 — `commit` tạo `Activity` + `Evidence`; bản nháp không tính vào
 * thống kê hoạt động.
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
    return toResponse(fail("invalid_input", "action không hợp lệ"));
  }

  try {
    const entry =
      parsed.data.action === "commit"
        ? await commitJournal({ id, skillId: parsed.data.skillId ?? null })
        : await classifyJournalLocal(id);

    return toResponse(ok(entry));
  } catch (error) {
    if (error instanceof Error && error.message === "journal_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục nhật ký"));
    }
    throw error;
  }
}

/**
 * DELETE /api/journal/[id] — xoá bản nháp.
 *
 * ⚠️ Chỉ xoá được bản nháp (`status = "draft"`); nhật ký đã commit giữ nguyên
 * để không mất lịch sử.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  await deleteDraft(id);
  return toResponse(ok({ deleted: true }));
}
