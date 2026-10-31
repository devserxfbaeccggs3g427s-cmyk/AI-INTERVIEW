import { fail, ok, toResponse } from "@/lib/api-response";
import { getCostSummary } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/costs?days= — tổng chi phí theo ngày + theo tính năng (FR-SC-15..19).
 *
 * ⚠️ FR-SC-18 — mọi giá trị tiền đều là **ước tính** theo bảng giá model.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30");

  if (![7, 30, 90].includes(days)) {
    return toResponse(fail("invalid_input", "days phải là 7, 30 hoặc 90"));
  }

  const summary = await getCostSummary(days);
  return toResponse(ok(summary));
}
