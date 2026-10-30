"use client";

/**
 * InsightList — 3 nhận định tuần (S13).
 *
 * Mỗi loại đều có màu sắc riêng theo design.md §4.13:
 *   - "good"  → tone "primary"   (xanh lá — điểm mạnh)
 *   - "fix"   → tone "tertiary"  (cam — cần sửa)
 *   - "try"   → tone "secondary" (tím — nên thử)
 *
 * Xem tasks.md 15.4 · design.md §4.13.
 */

import { Chip } from "@/components/ui/Chip";
import type { ReactNode } from "react";

/** Loại nhận định. */
export type InsightType = "good" | "fix" | "try";

export type Insight = {
  type: InsightType;
  text: string;
};

/** Cấu hình hiển thị theo loại nhận định — màu Chip + icon + label. */
const INSIGHT_CONFIG: Record<InsightType, { label: string; tone: "primary" | "tertiary" | "secondary"; icon: string }> =
  {
    good: { label: "Điểm mạnh", tone: "primary", icon: "check_circle" },
    fix: { label: "Cần sửa", tone: "tertiary", icon: "warning" },
    try: { label: "Nên thử", tone: "secondary", icon: "lightbulb" },
  };

export type InsightListProps = {
  /** 3 nhận định từ AI-07 (theo thứ tự good → fix → try). */
  insights: Insight[];
  /** Placeholder khi chưa có dữ liệu — empty state. */
  empty?: ReactNode;
};

export function InsightList({ insights, empty }: InsightListProps) {
  if (insights.length === 0) {
    return (
      <div className="text-center text-body-sm text-on-surface-variant py-gutter">
        {empty ?? "Chưa có nhận định. Chạy Weekly Review để sinh."}
      </div>
    );
  }

  // Đảm bảo thứ tự: good → fix → try (theo mockup §4.13).
  const ordered = [...insights].sort((a, b) => {
    const order: Record<InsightType, number> = { good: 0, fix: 1, try: 2 };
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });

  return (
    <div className="space-y-gutter-md">
      {ordered.map((insight, index) => {
        const cfg = INSIGHT_CONFIG[insight.type];
        return (
          <div
            key={`${insight.type}-${index}`}
            className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-gutter"
          >
            <div className="flex items-start gap-space-md">
              <Chip tone={cfg.tone} icon={cfg.icon}>
                {cfg.label}
              </Chip>
              <p className="mt-0.5 flex-1 text-body-md text-on-surface">{insight.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
