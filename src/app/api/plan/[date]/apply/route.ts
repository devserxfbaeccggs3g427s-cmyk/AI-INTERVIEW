import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { revalidatePlanPaths } from "@/lib/revalidate";
import { applyPlan } from "@/lib/daily-loop";
import { parseDateKey } from "@/lib/dates";
import { SLOT_COUNT } from "@/lib/config";
import { PlanItemInputSchema } from "@/app/api/plan/items/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/plan/[date]/apply — **duyệt** kế hoạch từ S02.
 *
 * Khác với `PATCH /api/plan/items` (dùng để sửa từng phần): endpoint này
 * nhận đủ 6 slot và ghi trong **1 transaction**, giữ nguyên slot `done`
 * (FR-DL-05 — slot đã xong là bất biến).
 *
 * Trả về `{ applied, keptDone }` — `keptDone` = số slot đã xong được giữ.
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

  const parsed = z
    .object({
      items: z.array(PlanItemInputSchema).length(SLOT_COUNT),
      source: z.enum(["ai", "fallback", "manual"]).optional(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", "invalid_payload: cần đúng 6 slot hợp lệ"),
    );
  }

  try {
    const result = await applyPlan({
      date,
      items: parsed.data.items,
      source: parsed.data.source ?? "manual",
    });

    // S01 đọc kế hoạch server-side ⇒ phải xoá cache sau khi ghi.
    revalidatePlanPaths();

    return toResponse(ok(result));
  } catch (error) {
    if (error instanceof Error && error.name === "InvalidDomainMixError") {
      return toResponse(
        fail("invalid_input", "invalid_domain_mix: tập domain phải đúng 1/1/2/2"),
      );
    }
    throw error;
  }
}
