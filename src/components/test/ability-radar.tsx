"use client";

import type { ItemTypeStat } from "@/lib/test";

export interface AbilityRadarProps {
  stats: ItemTypeStat[];
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 92;

/**
 * Radar năng lực 6 trục (SVG thuần — không thư viện).
 *
 * ⚠️ Task 18.3: bỏ trục không có dữ liệu (không vẽ 0) — tránh báo động giả.
 * ⚠️ Task 18.4: `role="img"` + `aria-label` mô tả tỷ lệ đúng theo dạng.
 */
export function AbilityRadar({ stats }: AbilityRadarProps) {
  // Chỉ giữ dạng có ít nhất 1 câu.
  const axes = stats.filter((stat) => stat.total > 0);

  if (axes.length < 3) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Cần ít nhất 3 dạng câu có dữ liệu để vẽ radar năng lực.
      </p>
    );
  }

  const step = (Math.PI * 2) / axes.length;
  const pointAt = (index: number, ratio: number) => {
    const angle = step * index - Math.PI / 2;
    return {
      x: CENTER + Math.cos(angle) * RADIUS * ratio,
      y: CENTER + Math.sin(angle) * RADIUS * ratio,
    };
  };

  const polygon = axes
    .map((stat, index) => {
      const point = pointAt(index, stat.rate);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`Radar năng lực: ${axes
        .map((stat) => `${stat.itemType} ${Math.round(stat.rate * 100)}%`)
        .join(", ")}`}
      className="mx-auto h-auto w-full max-w-[280px]"
    >
      {/* Lưới */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={axes
            .map((_, index) => {
              const point = pointAt(index, level);
              return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
            })
            .join(" ")}
          className="fill-surface-container-low stroke-outline-variant/30"
          strokeWidth={1}
        />
      ))}

      {/* Trục */}
      {axes.map((_, index) => {
        const point = pointAt(index, 1);
        return (
          <line
            key={index}
            x1={CENTER}
            y1={CENTER}
            x2={point.x}
            y2={point.y}
            className="stroke-outline-variant/30"
            strokeWidth={1}
          />
        );
      })}

      {/* Vùng đạt */}
      <polygon
        points={polygon}
        fill="rgba(78,222,163,0.2)"
        stroke="#4edea3"
        strokeWidth={2}
      />

      {/* Node */}
      {axes.map((stat, index) => {
        const point = pointAt(index, stat.rate);
        const color =
          stat.status === "good"
            ? "#4edea3"
            : stat.status === "ok"
              ? "#ffb95f"
              : "#ffb4ab";
        return (
          <circle
            key={stat.itemType}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={color}
          />
        );
      })}

      {/* Nhãn trục */}
      {axes.map((stat, index) => {
        const point = pointAt(index, 1.2);
        return (
          <text
            key={stat.itemType}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-[#bbcabf] font-code-md text-[9px]"
          >
            {stat.itemType}
          </text>
        );
      })}
    </svg>
  );
}
