import { ok, toResponse } from "@/lib/api-response";
import { analyzeCorrelation, getStateSeries } from "@/lib/journal";

export const dynamic = "force-dynamic";

/**
 * GET /api/state/correlation?days=30 — phân tích tương quan (FR-PS-05).
 *
 * ⚠️ FR-PS-07 — chạy **100% cục bộ** (SQLite + hàm tương quan thuần JS),
 * KHÔNG gọi AI. Dữ liệu chỉ số không bao giờ rời máy.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "30");
  const days = [7, 30].includes(daysParam) ? daysParam : 30;

  const series = await getStateSeries(days);
  const correlations = analyzeCorrelation(series);

  return toResponse(ok({ days, correlations }));
}
