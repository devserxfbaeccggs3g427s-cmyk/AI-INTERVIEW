import { fail, ok, toResponse } from "@/lib/api-response";
import { applyNextWeekPlan, ApplyPlanSchema } from "@/lib/weekly-review";
import { isValidIsoWeek } from "@/lib/week";

export const dynamic = "force-dynamic";

/**
 * POST /api/review/weekly/apply — duyệt & áp dụng kế hoạch tuần tới.
 *
 * ⚠️ AC-RP-5: ghi đúng 42 `PlanItem` (6 slot × 7 ngày); duyệt 2 lần không nhân bản.
 * ⚠️ `slots` phải đúng 6 phần tử, `slot` 0..5 không trùng ⇒ validate bằng Zod.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = ApplyPlanSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return toResponse(fail("invalid_input", issues.join("; ")));
  }

  const { week, slots, reducedLoad, reduceReason } = parsed.data;

  if (!isValidIsoWeek(week)) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  // Slot phải gồm đúng 0..5, mỗi slot một lần.
  const slotIndexes = slots.map((slot) => slot.slot).sort((a, b) => a - b);
  const unique = new Set(slotIndexes);
  if (unique.size !== 6 || slotIndexes[0] !== 0 || slotIndexes[5] !== 5) {
    return toResponse(fail("invalid_input", "invalid_slot: phải có đúng slot 0..5, mỗi slot một lần"));
  }

  try {
    const applied = await applyNextWeekPlan({
      week,
      slots: slots.map((slot) => ({
        slot: slot.slot,
        domain: slot.domain,
        action: slot.action,
        detail: slot.detail,
        minutes: slot.minutes,
        skillId: slot.skillId ?? null,
        skillName: slot.skillName ?? null,
        startTime: slot.startTime ?? null,
        endTime: slot.endTime ?? null,
        focusHint: slot.focusHint ?? null,
      })),
      reducedLoad,
      reduceReason,
    });

    return toResponse(ok({ applied, week }));
  } catch (error) {
    return toResponse(
      fail("db_error", error instanceof Error ? error.message : "Không lưu được kế hoạch"),
    );
  }
}
