import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { revalidatePlanPaths } from "@/lib/revalidate";
import { applyPlan, clampMinutes, validateDomainMix } from "@/lib/daily-loop";
import { parseDateKey } from "@/lib/dates";
import { SLOT_COUNT } from "@/lib/config";

export const dynamic = "force-dynamic";

export const PlanItemInputSchema = z.object({
  slot: z.number().int().min(0).max(5),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  action: z.string().min(1).max(160),
  detail: z.string().max(120),
  minutes: z.number().int().min(5).max(90),
  skillId: z.string().nullable(),
});

export const UpdatePlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(PlanItemInputSchema).length(SLOT_COUNT),
  /** true = ghi vào DB (duyệt kế hoạch). */
  apply: z.boolean().default(false),
});

/**
 * PATCH /api/plan/items — sửa & duyệt kế hoạch.
 *
 * - `apply: false` → chỉ validate, không ghi (S02 giữ bản nháp ở client).
 * - `apply: true`  → ghi 6 slot trong 1 transaction, giữ nguyên slot `done`.
 *
 * Lỗi:
 *   400 invalid_slot       — slot trùng hoặc thiếu
 *   400 invalid_domain_mix — tập domain không đúng 1/1/2/2
 *   400 minutes_out_of_range — minutes ngoài khoảng của slot (đã clamp)
 */
export async function PATCH(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = UpdatePlanSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const isSlotIssue = issues.some((i) => i.startsWith("items"));
    return toResponse(
      fail("invalid_input", isSlotIssue ? "invalid_slot: phải có đúng 6 slot 0..5" : issues.join("; ")),
    );
  }

  const { date: dateKey, items, apply } = parsed.data;

  const date = parseDateKey(dateKey);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  // Slot phải gồm đúng 0..5, mỗi slot một lần.
  const slots = items.map((item) => item.slot).sort((a, b) => a - b);
  const uniqueSlots = new Set(slots);
  if (uniqueSlots.size !== SLOT_COUNT || slots[0] !== 0 || slots[SLOT_COUNT - 1] !== 5) {
    return toResponse(fail("invalid_input", "invalid_slot: phải có đúng slot 0..5, mỗi slot một lần"));
  }

  // Bất biến tập domain 4 trục (P5).
  const mix = validateDomainMix(items);
  if (!mix.ok) {
    return toResponse(fail("invalid_input", `invalid_domain_mix: ${mix.message}`));
  }

  // Clamp minutes về khoảng hợp lệ của slot (AC-DL-2: lệch nhẹ do sửa inline).
  const clamped = items.map((item) => ({
    ...item,
    minutes: clampMinutes(item.slot, item.minutes),
  }));
  const adjusted = clamped.some((item, i) => item.minutes !== items[i].minutes);

  if (!apply) {
    return toResponse(
      ok({
        updated: 0,
        keptDone: 0,
        totalMinutes: clamped.reduce((sum, item) => sum + item.minutes, 0),
        items: clamped,
        adjusted,
      }),
    );
  }

  const result = await applyPlan({ date, items: clamped, source: "manual" });

  // S01 đọc kế hoạch server-side ⇒ phải xoá cache sau khi ghi.
  // ⚠️ `revalidatePath` phải gọi TRƯỚC `return` — đặt sau `return` là dead code.
  revalidatePlanPaths();

  return toResponse(ok({ ...result, items: clamped, adjusted }));
}
