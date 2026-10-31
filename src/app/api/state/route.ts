import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getPrefillState, getStateSeries, saveDailyState } from "@/lib/journal";
import { parseDateKey, toDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const StateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  sleep: z.number().min(0).max(24).nullable().optional(),
  focus: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/**
 * PUT /api/state — lưu chỉ số chính (FR-PS-01, FR-PSJ-08).
 *
 * Upsert theo ngày: ghi nhiều lần trong ngày chỉ giữ bản ghi mới nhất.
 */
export async function PUT(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = StateSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const date = parseDateKey(parsed.data.date);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  // ⚠️ `date` (Date) phải đặt SAU `...parsed.data` — ngược lại chuỗi
  // `parsed.data.date` sẽ ghi đè Date.
  const state = await saveDailyState({ ...parsed.data, date });
  return toResponse(ok(state));
}

/**
 * GET /api/state?date=&days= — đọc chỉ số + chuỗi theo ngày.
 *
 * Không có `date` ⇒ trả **prefill** (FR-PSJ-07).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = [7, 30].includes(daysParam) ? daysParam : 7;

  if (!dateParam) {
    const prefill = await getPrefillState();
    const series = await getStateSeries(days);
    return toResponse(ok({ prefill, series }));
  }

  const date = parseDateKey(dateParam);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  const { getDailyState } = await import("@/lib/journal");
  const state = await getDailyState(date);
  const series = await getStateSeries(days);

  return toResponse(ok({ state, series, todayKey: toDateKey(new Date()) }));
}
