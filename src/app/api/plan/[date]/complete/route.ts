import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { revalidatePlanPaths } from "@/lib/revalidate";
import { completePlanItem, PlanItemNotFoundError, uncompletePlanItem } from "@/lib/daily-loop";
import { parseDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const CompletePlanSchema = z.object({
  slot: z.number().int().min(0).max(5),
  /** 1..5 → Evidence.rating (mặc định 3). */
  quality: z.number().int().min(1).max(5).optional(),
  minutes: z.number().int().min(1).max(180).optional(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/plan/[date]/complete — đánh dấu 1 slot hoàn thành (FR-DL-03).
 *
 * Idempotent: bấm "Xong" 2 lần không tạo 2 `Activity` (AC-1).
 * P3: tạo `Activity` + `Evidence` (nếu slot gắn kỹ năng), **không** tăng `Skill.level`.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { date: dateKey } = await ctx.params;

  const date = parseDateKey(dateKey);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = CompletePlanSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", `invalid_slot: ${parsed.error.issues.map((i) => i.message).join("; ")}`),
    );
  }

  try {
    const result = await completePlanItem({ date, ...parsed.data });

    // S01 đọc kế hoạch server-side ⇒ phải xoá cache sau khi ghi.
    // ⚠️ `revalidatePath` phải gọi TRƯỚC `return` — đặt sau `return` là dead code.
    revalidatePlanPaths();

    return toResponse(ok(result));
  } catch (error) {
    if (error instanceof PlanItemNotFoundError) {
      return toResponse(fail("not_found", `Không tìm thấy plan item cho slot ${error.slot}`));
    }
    throw error;
  }
}

const UncompleteBodySchema = z.object({
  slot: z.number().int().min(0).max(5),
});

/**
 * DELETE /api/plan/[date]/complete — **bỏ** đánh dấu hoàn thành (R-DL-5).
 *
 * Xoá `Activity` + `Evidence` tương ứng và đặt `PlanItem.done = false`.
 * Đây là "đường bỏ đánh dấu" mà R-DL-5 yêu cầu — bấm "Xong" nhầm thì
 * gỡ được, không để lại bằng chứng rỗng làm sai `Skill.level`.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { date: dateKey } = await ctx.params;

  const date = parseDateKey(dateKey);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = UncompleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "invalid_slot: slot phải là 0..5"));
  }

  try {
    const result = await uncompletePlanItem({ date, slot: parsed.data.slot });

    // Xoá cache sau khi ghi (xem giải thích ở POST).
    revalidatePlanPaths();

    return toResponse(ok(result));
  } catch (error) {
    if (error instanceof PlanItemNotFoundError) {
      return toResponse(fail("not_found", `Không tìm thấy plan item cho slot ${error.slot}`));
    }
    throw error;
  }
}
