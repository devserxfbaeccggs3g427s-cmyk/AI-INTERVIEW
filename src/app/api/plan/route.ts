import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getPlanForDate } from "@/lib/daily-loop";
import { parseDateKey, toDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Query `?date=yyyy-MM-dd` — mặc định hôm nay. */
const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/plan?date=yyyy-MM-dd
 *
 * Trả về kế hoạch của ngày + đếm xong + streak + năng lượng tuần.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ date: url.searchParams.get("date") ?? undefined });

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "Ngày phải có định dạng yyyy-MM-dd"));
  }

  const date = parseDateKey(parsed.data.date ?? toDateKey(new Date()));
  if (!date) {
    return toResponse(fail("invalid_input", "Ngày không hợp lệ"));
  }

  const plan = await getPlanForDate(date);
  return toResponse(ok(plan));
}
