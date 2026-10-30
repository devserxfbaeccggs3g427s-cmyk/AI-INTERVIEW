"use client";

import { cn } from "@/components/ui/Button";
import { Label } from "@/components/ui/Card";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { color } from "@/styles/tokens";
import type { WeeklyProgressPoint } from "@/lib/skills-data";

/**
 * Biểu đồ đường "Tiến trình xác thực theo tuần" (task 7.8).
 *
 * Một trục Y duy nhất (không dual-axis). Đường chính = bằng chứng rating >= 3
 * tích luỹ; đường ngưỡng = `LEVEL_THRESHOLDS[targetLevel]` (mốc bằng chứng
 * cần có để lên target level).
 *
 * Màu lấy từ `src/styles/tokens.ts` (bảng mirror của `@theme` trong
 * globals.css) — KHÔNG hardcode hex trong component (NFR-10).
 *
 * Xem tasks.md 7.8 · design.md §4.4 · FR-SK-03.
 */

/** Nội dung tooltip — bổ sung, không phải điều kiện để đọc dữ liệu. */
type TooltipPayload = {
  payload?: { label?: string; cumulative?: number; weekly?: number };
};

function ChartTooltip({
  active,
  payload,
  threshold,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  threshold: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-code-md text-label-sm text-on-surface-variant">{point.label}</div>
      <div className="mt-0.5 font-label-md text-on-surface">
        Tích luỹ: {point.cumulative ?? 0} bằng chứng
      </div>
      <div className="font-label-md text-on-surface-variant">
        Tuần này: +{point.weekly ?? 0}
      </div>
      <div className="font-label-md text-on-surface-variant">
        Ngưỡng cấp: {threshold}
      </div>
    </div>
  );
}

export function LineChart({
  data,
  threshold,
  thresholdLabel,
  className,
}: {
  /** Điểm dữ liệu theo tuần (đã cộng dồn ở server). */
  data: WeeklyProgressPoint[];
  /** Ngưỡng số bằng chứng để đạt target level. */
  threshold: number;
  /** Nhãn ngưỡng, ví dụ "Ngưỡng Cấp 3". */
  thresholdLabel: string;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");
  const seriesColor = color("primary");
  const thresholdColor = color("tertiary");

  const maxValue = Math.max(threshold, ...data.map((d) => d.cumulative), 1);

  return (
    <div className={cn("space-y-space-md", className)} data-testid="line-chart">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        {/* Legend luôn hiện khi có ≥ 2 series — định danh không bao giờ chỉ dựa vào màu. */}
        <div className="flex flex-wrap items-center gap-space-md">
          <span className="flex items-center gap-1.5 font-label-md text-on-surface-variant">
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ backgroundColor: seriesColor }}
              aria-hidden
            />
            Bằng chứng tích luỹ (≥ 3★)
          </span>
          <span className="flex items-center gap-1.5 font-label-md text-on-surface-variant">
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ backgroundColor: thresholdColor }}
              aria-hidden
            />
            {thresholdLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="font-label-md text-secondary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? "Ẩn bảng" : "Xem bảng"}
        </button>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            {/* Gridline hairline LIỀN (không dashed) — recessive. */}
            <CartesianGrid stroke={gridColor} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
            />
            <YAxis
              domain={[0, maxValue]}
              allowDecimals={false}
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
              width={44}
            />
            <Tooltip
              content={<ChartTooltip threshold={threshold} />}
              cursor={{ stroke: gridColor, strokeWidth: 1 }}
            />
            {/* Đường ngưỡng level — ReferenceLine, không phải series nên không cần legend riêng. */}
            <ReferenceLine
              y={threshold}
              stroke={thresholdColor}
              strokeWidth={2}
              label={{
                value: thresholdLabel,
                position: "insideTopRight",
                fill: thresholdColor,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
              }}
            />
            {/* Đường chính: 2px, marker ≥ 8px. */}
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={seriesColor}
              strokeWidth={2}
              dot={{ r: 4, fill: seriesColor, stroke: color("surface-container"), strokeWidth: 2 }}
              activeDot={{ r: 6, fill: seriesColor, stroke: color("surface-container"), strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>

      {/* Bảng dữ liệu — twin của biểu đồ, để không gate thông tin vào màu/hover. */}
      {showTable ? (
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">Tiến trình xác thực theo tuần</caption>
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">
                Tuần
              </th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">
                Tích luỹ
              </th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">
                Trong tuần
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-outline-variant/20">
                <td className="py-1 font-code-md text-on-surface-variant">{d.label}</td>
                <td className="py-1 font-code-md text-on-surface">{d.cumulative}</td>
                <td className="py-1 font-code-md text-on-surface-variant">+{d.weekly}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Label>
          Tổng tích luỹ {data.length > 0 ? (data[data.length - 1]?.cumulative ?? 0) : 0} bằng chứng
          · ngưỡng {threshold}
        </Label>
      )}
    </div>
  );
}
