"use client";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/Card";
import { useState } from "react";
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { color } from "@/styles/tokens";
import type { ItemType } from "@/lib/test-types";
import { ITEM_TYPE_LABELS } from "@/lib/test-types";

/**
 * `ResultRadar` — biểu đồ radar 6 trục + table twin (task 14.15).
 *
 * Hiển thị điểm theo 6 dạng câu: mc_vocab, mc_grammar, cloze, listening, writing, translation.
 * Tổng điểm ở phía dưới (ví dụ: 15+10+8+7=40).
 *
 * Xem tasks.md 14.15 · design.md §4.19 / S21.
 */

export type RadarPoint = {
  itemType: ItemType;
  score: number; // 0..100%
  correct: number;
  total: number;
  label: string; // tiếng Việt
};

export interface ResultRadarProps {
  /** Điểm 6 trục (theo thứ tự ITEM_TYPES). */
  items: RadarPoint[];
  /** Tổng điểm. */
  totalScore: number;
  /** Điểm tối đa. */
  maxScore: number;
  className?: string;
}

const CHART_COLOR = color("primary");

function RadarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: RadarPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-code-md text-label-sm text-on-surface-variant">{point.label}</div>
      <div className="mt-0.5 font-label-md text-on-surface">
        {point.correct}/{point.total} đúng ({point.score}%)
      </div>
    </div>
  );
}

export function ResultRadar({ items, totalScore, maxScore, className }: ResultRadarProps) {
  const [showTable, setShowTable] = useState(false);

  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");

  // Chuẩn bị data cho radar — mỗi item có 1 trục
  const radarData = items.map((item) => ({
    itemType: item.itemType,
    label: item.label,
    score: item.score,
  }));

  return (
    <div className={cn("space-y-space-md", className)} data-testid="result-radar">
      {/* Header: tổng điểm */}
      <div className="flex items-center justify-between">
        <Label>Kết quả theo dạng câu</Label>
        <div className="flex items-center gap-2 font-label-md">
          <span className="text-primary">{totalScore}</span>
          <span className="text-on-surface-variant">/</span>
          <span className="text-on-surface-variant">{maxScore}</span>
          <span className="text-on-surface-variant">
            = {Math.round((totalScore / Math.max(1, maxScore)) * 100)}%
          </span>
        </div>
      </div>

      {/* Radar chart */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart data={radarData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <PolarGrid stroke={gridColor} strokeWidth={1} />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickLine={false}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: textColor, fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<RadarTooltip />} cursor={{ stroke: gridColor, strokeWidth: 1 }} />
            <Radar
              name="Điểm"
              dataKey="score"
              stroke={CHART_COLOR}
              fill={CHART_COLOR}
              fillOpacity={0.3}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>

      {/* Bảng chi tiết + toggle */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="font-label-md text-secondary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? "Ẩn bảng" : "Xem bảng"}
        </button>
      </div>

      {/* Table twin */}
      {showTable ? (
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">Kết quả theo dạng câu</caption>
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">Dạng câu</th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">Đúng</th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">Tổng</th>
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">%</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.itemType} className="border-b border-outline-variant/20">
                <td className="py-1 font-code-md text-on-surface-variant">{item.label}</td>
                <td className="py-1 font-code-md text-on-surface">{item.correct}</td>
                <td className="py-1 font-code-md text-on-surface-variant">{item.total}</td>
                <td className="py-1 font-code-md text-on-surface">{item.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Label>
          Tổng cộng: {totalScore}/{maxScore} = {Math.round((totalScore / Math.max(1, maxScore)) * 100)}%
        </Label>
      )}
    </div>
  );
}