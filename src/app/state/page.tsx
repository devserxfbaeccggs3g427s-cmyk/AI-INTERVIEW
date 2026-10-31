import { analyzeCorrelation, getPrefillState, getStateSeries } from "@/lib/journal";
import { toDateKey } from "@/lib/dates";

import { StateDashboard } from "@/components/journal/state-dashboard";

export const dynamic = "force-dynamic";

/**
 * S12 — Đánh giá chính (`/state`).
 *
 * ⚠️ FR-PS-07 — phân tích tương quan chạy **100% cục bộ** (SQLite + hàm
 * tương quan thuần JS), KHÔNG gọi AI. Dữ liệu chỉ số không rời máy.
 */
export default async function StatePage() {
  const prefill = await getPrefillState();
  const series = await getStateSeries(30);
  const correlations = analyzeCorrelation(series);

  return (
    <StateDashboard
      todayKey={toDateKey(new Date())}
      prefill={prefill}
      series={series}
      correlations={correlations}
    />
  );
}
