"use client";

/**
 * S12 — Biểu đồ tương quan mood/energy/sleep ↔ số hành động hoàn thành (task 8.4).
 *
 * - Dùng **recharts** (đã cài `^3.10.1`) với **2 trục Y**:
 *   - Trục trái: chỉ số 1–5 (mood / energy) và giấc ngủ (giờ, quy đổi về cùng
 *     thang 0–5 để vẽ chung 1 trục — giữ nguyên ý nghĩa vì mockup cũng chỉ có
 *     1 trục chỉ số + 1 trục slot).
 *   - Trục phải: số slot Daily Loop đã hoàn thành (0–6, `SLOT_COUNT`).
 * - Hệ số tương quan `r` được **tính từ dữ liệu thật** (Pearson) chứ không
 *   hardcode `r=0.88` như mockup.
 *
 * Xem tasks.md 8.4 / 8.5 · requirements.md FR-PS-05, FR-PS-06, AC 10.6 / 10.11.
 */

import { Card, CardHeader } from "@/components/ui/Card";
import { SLOT_COUNT } from "@/lib/types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Một ngày trong biểu đồ. */
export type ChartDay = {
  /** Nhãn trục X — ví dụ "23/10". */
  label: string;
  /** Key `YYYY-MM-DD` — dùng làm `key` của recharts. */
  key: string;
  mood: number | null;
  energy: number | null;
  /** Giấc ngủ (giờ). */
  sleep: number | null;
  /** Số hành động đã hoàn thành trong ngày (đếm `PlanItem.done`). */
  done: number;
};

/** Số slot tối đa mỗi ngày — nguồn: `SLOT_COUNT` trong `src/lib/types.ts`. */
const MAX_SLOTS = SLOT_COUNT;

/**
 * Hệ số tương quan Pearson giữa 2 mảng.
 *
 * Trả `null` khi thiếu dữ liệu hoặc một mảng là hằng số (mẫu số = 0) —
 * lúc đó không nên hiển thị một con số tùy ý.
 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i] ?? 0;
    sumY += ys[i] ?? 0;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom === 0) return null;
  return cov / denom;
}

/** Chuyển giờ ngủ sang thang 0–5 để vẽ chung trục với mood/energy. */
function sleepToScale(hours: number | null): number | null {
  if (hours === null) return null;
  // 8 giờ = 5/5, 0 giờ = 0/5 → tuyến tính, clamp trong [0, 5].
  return Math.max(0, Math.min(5, (hours / 8) * 5));
}

/**
 * Biểu đồ nhịp độ 7/30 ngày.
 *
 * `range` + `onRangeChange` do parent điều khiển (task 8.5 — toggle 7/30 ngày).
 */
export function CorrelationChart({
  days,
  range,
  onRangeChange,
}: {
  days: ChartDay[];
  range: 7 | 30;
  onRangeChange: (range: 7 | 30) => void;
}) {
  const windowed = days.slice(-range);

  const rows = windowed.map((day) => ({
    ...day,
    sleepScale: sleepToScale(day.sleep),
  }));

  // `r` tính trên các ngày có đủ cả chỉ số và số hành động.
  const paired = rows.filter(
    (row) => row.energy !== null && row.mood !== null && row.done !== null,
  );
  // Chỉ số tổng hợp = trung bình mood + energy.
  // ⚠️ Cần dấu ngoặc quanh cả tổng — nếu không, JS hiểu là
  // `mood + (energy / 2)` → sai số liệu (mất ý nghĩa "trung bình 2 chỉ số").
  const r = pearson(
    paired.map((row) => ((row.mood ?? 0) + (row.energy ?? 0)) / 2),
    paired.map((row) => row.done),
  );

  return (
    <Card>
      <CardHeader
        title={`Biểu đồ nhịp độ ${range} ngày`}
        subtitle="Đối chiếu Mood / Energy với số hành động hoàn thành"
        icon="insights"
        action={
          <div
            className="flex rounded-lg bg-surface-container p-0.5 font-label-sm text-on-surface-variant"
            role="group"
            aria-label="Khoảng thời gian biểu đồ"
          >
            {([7, 30] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onRangeChange(option)}
                aria-pressed={range === option}
                className={`rounded px-2.5 py-1 font-label-sm transition-colors ${
                  range === option
                    ? "bg-surface-container-high font-semibold text-primary"
                    : "hover:text-on-surface"
                }`}
              >
                {option} Ngày
              </button>
            ))}
          </div>
        }
      />

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }}
              stroke="var(--color-outline-variant)"
            />
            {/* Trục trái: chỉ số 1–5 */}
            <YAxis
              yAxisId="left"
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }}
              stroke="var(--color-outline-variant)"
            />
            {/* Trục phải: số hành động hoàn thành */}
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, MAX_SLOTS]}
              ticks={[0, 2, 4, 6]}
              tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
              stroke="var(--color-secondary)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-container-high)",
                border: "1px solid var(--color-outline-variant)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-on-surface)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="mood"
              name="Mood (1-5)"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="energy"
              name="Energy (1-5)"
              stroke="var(--color-tertiary)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sleepScale"
              name="Ngủ (quy đổi 0-5)"
              stroke="var(--color-outline)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="done"
              name="Hành động hoàn thành"
              stroke="var(--color-secondary)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-space-md flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-gutter">
          <span className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <span className="h-1 w-2.5 rounded-full bg-primary" aria-hidden />
            Mood / Energy (1-5)
          </span>
          <span className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <span className="h-1 w-2.5 rounded-full bg-secondary" aria-hidden />
            Hành động hoàn thành (0-{MAX_SLOTS})
          </span>
        </div>
        {/* `r` tính từ dữ liệu thật — không hardcode giá trị mockup. */}
        <span className="font-code-md font-semibold text-primary">
          {r === null ? "Tương quan: chưa đủ dữ liệu" : `Tương quan r=${r.toFixed(2)}`}
        </span>
      </div>
    </Card>
  );
}
