"use client";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/Card";
import { useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { color } from "@/styles/tokens";
import type { ItemType } from "@/lib/test-types";
import { ITEM_TYPE_LABELS } from "@/lib/test-types";

/**
 * `BenchmarkChart` — biểu đồ tiến trình benchmark nhiều kỳ + 6 dạng câu + 5 từ sai (task 14.3).
 *
 * - Đường biểu diễn tỷ lệ đúng theo thời gian (W40 → W43...).
 * - Cột nhỏ cho 6 dạng câu: mc_vocab, mc_grammar, cloze, listening, writing, translation.
 * - Danh sách 5 từ sai nhiều nhất.
 *
 * Xem tasks.md 14.3 · design.md §4.16 / S19.
 */

export type BenchmarkPeriodPoint = {
  label: string; // "W40", "W41"...
  accuracy: number; // % (0..100)
};

export type ItemTypeAccuracy = {
  itemType: ItemType;
  accuracy: number; // %
  correct: number;
  total: number;
};

export type WrongWord = {
  word: string;
  wrongCount: number;
  itemType: ItemType;
};

export interface BenchmarkChartProps {
  /** Tiến trình benchmark theo thời gian. */
  periods: BenchmarkPeriodPoint[];
  /** Tỷ lệ đúng theo 6 dạng câu. */
  itemTypeAccuracies: ItemTypeAccuracy[];
  /** 5 từ/câu sai nhiều nhất. */
  wrongWords: WrongWord[];
  className?: string;
}

const CHART_COLORS = [
  color("primary"),
  color("secondary"),
  color("tertiary"),
  color("error"),
  color("surface-tint"),
  color("on-secondary"),
];

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: BenchmarkPeriodPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-code-md text-label-sm text-on-surface-variant">{point.label}</div>
      <div className="mt-0.5 font-label-md text-on-surface">Độ chính xác: {point.accuracy}%</div>
    </div>
  );
}

export function BenchmarkChart({
  periods,
  itemTypeAccuracies,
  wrongWords,
  className,
}: BenchmarkChartProps) {
  const [showTable, setShowTable] = useState(false);

  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");
  const seriesColor = color("primary");

  const maxAccuracy = Math.max(100, ...periods.map((d) => d.accuracy));

  return (
    <div className={cn("space-y-space-md", className)} data-testid="benchmark-chart">
      {/* Phần 1: Đường tiến trình benchmark */}
      <div>
        <Label>Tiến trình benchmark</Label>
        <div className="h-48 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={periods} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={gridColor} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
                stroke={axisColor}
                tickLine={false}
                axisLine={{ stroke: axisColor }}
              />
              <YAxis
                domain={[0, maxAccuracy]}
                tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
                stroke={axisColor}
                tickLine={false}
                axisLine={{ stroke: axisColor }}
                width={44}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ProgressTooltip />} cursor={{ stroke: gridColor, strokeWidth: 1 }} />
              <Bar dataKey="accuracy" fill={seriesColor} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Phần 2: Bảng 6 dạng câu */}
      <div>
        <Label>Độ chính xác theo dạng câu</Label>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {itemTypeAccuracies.map((item, i) => {
            const itemColor = CHART_COLORS[i % CHART_COLORS.length];
            return (
              <div
                key={item.itemType}
                className="rounded-lg bg-surface-container p-space-sm border border-outline-variant/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-on-surface-variant">
                    {ITEM_TYPE_LABELS[item.itemType]}
                  </span>
                  <span
                    className="font-label-md text-on-surface"
                    style={{ color: itemColor }}
                  >
                    {item.accuracy}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-outline-variant/30 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, item.accuracy)}%`,
                      backgroundColor: itemColor,
                    }}
                  />
                </div>
                <div className="mt-0.5 font-label-xs text-on-surface-variant">
                  {item.correct}/{item.total} đúng
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phần 3: 5 từ sai nhiều nhất */}
      <div>
        <Label>Từ sai nhiều nhất</Label>
        <div className="mt-2 space-y-1">
          {wrongWords.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">Chưa có từ sai.</p>
          ) : (
            wrongWords.map((w, i) => (
              <div
                key={`${w.word}-${i}`}
                className="flex items-center justify-between rounded-md bg-surface-container-low px-space-sm py-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full font-label-sm"
                    style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}20`, color: CHART_COLORS[i % CHART_COLORS.length] }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-label-sm text-on-surface">{w.word}</span>
                </div>
                <div className="flex items-center gap-1 font-label-sm text-on-surface-variant">
                  <span className="material-symbols text-sm" style={{ color: color("error") }}>
                    error_outline
                  </span>
                  <span>{w.wrongCount} lần</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bảng dữ liệu twin */}
      {showTable && (
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">Dữ liệu benchmark</caption>
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">Kỳ</th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">Độ chính xác</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((d) => (
              <tr key={d.label} className="border-b border-outline-variant/20">
                <td className="py-1 font-code-md text-on-surface-variant">{d.label}</td>
                <td className="py-1 font-code-md text-on-surface">{d.accuracy}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}