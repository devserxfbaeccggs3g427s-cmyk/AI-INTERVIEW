import { fail, ok, toResponse } from "@/lib/api-response";
import { getPlanForDate } from "@/lib/daily-loop";
import { parseDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * GET /api/plan/[date] — kế hoạch của một ngày cụ thể (FR-DL-08).
 *
 * Ngày không hợp lệ → 400. Ngày hợp lệ nhưng chưa có kế hoạch → trả plan rỗng
 * (không phải lỗi) — S01 hiển thị empty state.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { date: dateKey } = await ctx.params;

  const date = parseDateKey(dateKey);
  if (!date) {
    return toResponse(fail("invalid_input", "Ngày phải có định dạng yyyy-MM-dd"));
  }

  const plan = await getPlanForDate(date);
  return toResponse(ok(plan));
}
