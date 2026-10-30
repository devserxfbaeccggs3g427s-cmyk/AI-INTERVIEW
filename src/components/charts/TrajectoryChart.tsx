"use client";

import { cn } from "@/components/ui/Button";
import { Label } from "@/components/ui/Card";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { color } from "@/styles/tokens";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";
import type { TrajectoryData } from "@/lib/progress-types";

/**
 * `TrajectoryChart` — Quỹ đạo tăng trưởng cây kỹ năng 6 tháng (task 16.2).
 *
 * - **4 đường**, mỗi đường = 1 domain (`DOMAINS`), màu gán **theo domain**
 *   nên lọc domain không làm đổi màu các đường còn lại.
 * - **Trục Y cố định 0–5** — level là thang ordinal có thật, không tự co giãn
 *   theo dữ liệu (nếu co giãn, 2 domain có level 0 và 1 sẽ trông như nhau).
 * - Mỗi điểm = **level trung bình của các skill thuộc domain tại đầu tháng**,
 *   tái dựng từ `Evidence` (xem `src/lib/progress-data.ts`).
 *
 * Pattern chuẩn của project: `color()` từ `@/styles/tokens`,
 * `isAnimationActive={false}`, `data-testid`, bảng "Xem bảng"/"Ẩn bảng" làm
 * twin a11y của biểu đồ.
 *
 * Xem tasks.md 16.2 · design.md §4.4.
 */

/** Màu cố định cho từng domain — theo thứ tự `DOMAINS`, không xoay vòng. */
export const DOMAIN_COLORS: Record<Domain, string> = {
  professional: color("primary"),
  communication: color("secondary"),
  language: color("tertiary"),
  personal: color("outline"),
};

type TooltipPayload = {
  payload?: Record<string, string | number | null | undefined>;
};

/** Tooltip — bổ sung, không phải điều kiện để đọc số liệu. */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-code-md text-label-sm text-on-surface-variant">{String(point.label)}</div>
      <div className="mt-1 space-y-0.5">
        {DOMAINS.map((domain) => {
          const value = point[domain];
          if (value === undefined || value === null) return null;
          return (
            <div key={domain} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ backgroundColor: DOMAIN_COLORS[domain] }}
                aria-hidden
              />
              <span className="font-label-md text-on-surface-variant">
                {DOMAIN_LABELS[domain]}
              </span>
              <span className="font-code-md text-on-surface">
                {typeof value === "number" ? value.toFixed(1) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrajectoryChart({
  data,
  /** Domain đang lọc — chỉ domain này được vẽ (null = vẽ tất cả). */
  activeDomain = null,
  className,
}: {
  /** Dữ liệu quỹ đạo đã tính sẵn ở server. */
  data: TrajectoryData;
  /** Lọc domain (task 16.6). `null` = tất cả. */
  activeDomain?: Domain | null;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");

  // Chỉ vẽ domain đang lọc — màu gắn theo domain nên không bị repaint.
  const visibleSeries = activeDomain
    ? data.series.filter((s) => s.domain === activeDomain)
    : data.series;

  // Trộn tháng + level của các domain đang hiện → mảng cho recharts.
  const rows = data.months.map((month, i) => {
    const row: Record<string, string | number | null> = {
      label: month.label,
      shortLabel: month.shortLabel,
    };
    for (const series of visibleSeries) {
      row[series.domain] = series.levels[i] ?? null;
    }
    return row;
  });

  const lastIndex = rows.length - 1;

  return (
    <div className={cn("space-y-space-md", className)} data-testid="trajectory-chart">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        {/* Legend luôn hiện khi có ≥ 2 series — định danh không bao giờ chỉ dựa vào màu. */}
        {visibleSeries.length >= 2 ? (
          <div className="flex flex-wrap items-center gap-space-md">
            {visibleSeries.map((series) => {
              const last = series.levels[lastIndex];
              return (
                <span
                  key={series.domain}
                  className="flex items-center gap-1.5 font-label-md text-on-surface-variant"
                >
                  <span
                    className="inline-block h-0.5 w-4 rounded-full"
                    style={{ backgroundColor: DOMAIN_COLORS[series.domain] }}
                    aria-hidden
                  />
                  {series.label}
                  {typeof last === "number" ? ` (Lv ${last.toFixed(1)})` : ""}
                </span>
              );
            })}
          </div>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="font-label-md text-secondary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? "Ẩn bảng" : "Xem bảng"}
        </button>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
            {/* Gridline hairline LIỀN (không dashed) — recessive. */}
            <CartesianGrid stroke={gridColor} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
            />
            {/* Trục Y cố định 0–5 — thang level là cố định, không co theo data. */}
            <YAxis
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              allowDecimals={false}
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: gridColor, strokeWidth: 1 }} />
            {visibleSeries.map((series) => (
              <Line
                key={series.domain}
                type="monotone"
                dataKey={series.domain}
                name={series.label}
                stroke={DOMAIN_COLORS[series.domain]}
                strokeWidth={2}
                dot={{
                  r: 4,
                  fill: DOMAIN_COLORS[series.domain],
                  stroke: color("surface-container"),
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: DOMAIN_COLORS[series.domain],
                  stroke: color("surface-container"),
                  strokeWidth: 2,
                }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>

      {/* Bảng dữ liệu — twin của biểu đồ, để không gate thông tin vào màu/hover. */}
      {showTable ? (
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">Quỹ đạo level kỹ năng theo domain trong 6 tháng</caption>
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">
                Tháng
              </th>
              {visibleSeries.map((series) => (
                <th
                  key={series.domain}
                  scope="col"
                  className="py-1 text-right font-label-md text-on-surface-variant"
                >
                  {series.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.shortLabel)} className="border-b border-outline-variant/20">
                <td className="py-1 font-code-md text-on-surface-variant">{String(row.label)}</td>
                {visibleSeries.map((series) => {
                  const value = row[series.domain];
                  return (
                    <td
                      key={series.domain}
                      className="py-1 text-right font-code-md text-on-surface"
                    >
                      {typeof value === "number" ? value.toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Label>
          {visibleSeries.length} domain · {data.months.length} tháng · thang level 0–5
        </Label>
      )}
    </div>
  );
}
