import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { deleteLog, updateLog } from "@/lib/log";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  text: z.string().min(1).max(160).optional(),
  domain: z.enum(["professional", "communication", "language", "personal"]).optional(),
  type: z
    .enum(["study", "write", "speak", "srs", "journal", "health", "custom"])
    .optional(),
  minutes: z.number().int().min(1).max(240).optional(),
  skillId: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(4).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  language: z.enum(["en", "zh", "vi"]).nullable().optional(),
});

/**
 * PATCH /api/log/[id] — sửa 1 mục lịch sử (FR-QL-11).
 *
 * ⚠️ Sửa mức độ khó ⇒ cập nhật `Evidence.rating` + tính lại `level`.
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
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  try {
    const entry = await updateLog(id, parsed.data);
    return toResponse(ok(entry));
  } catch (error) {
    if (error instanceof Error && error.message === "log_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục lịch sử"));
    }
    throw error;
  }
}

/**
 * DELETE /api/log/[id] — xoá 1 mục lịch sử (FR-QL-12).
 *
 * Xoá `Activity` ⇒ `Evidence` cascade ⇒ tính lại `level` kỹ năng bị ảnh hưởng.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  try {
    await deleteLog(id);
    return toResponse(ok({ deleted: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "log_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục lịch sử"));
    }
    throw error;
  }
}
