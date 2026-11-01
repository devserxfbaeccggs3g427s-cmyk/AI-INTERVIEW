"use client";

import { cn } from "@/lib/cn";
import type { ItemTypeStat } from "@/lib/test";

export interface ItemTypeBreakdownProps {
  stats: ItemTypeStat[];
}

/**
 * Ô theo dạng câu — ngưỡng: ≥75% Tốt · 60–74% Đạt · <60% Cần cải thiện.
 *
 * ⚠️ P7: mọi số liệu đến từ `stats` — không hardcode.
 */
export function ItemTypeBreakdown({ stats }: ItemTypeBreakdownProps) {
  if (stats.length === 0) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Chưa có dữ liệu dạng câu.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-space-sm md:grid-cols-3">
      {stats.map((stat) => {
        const pct = Math.round(stat.rate * 100);
        const tone =
          stat.status === "good"
            ? "bg-primary/10 text-primary"
            : stat.status === "ok"
              ? "bg-tertiary/10 text-tertiary"
              : "bg-error/15 text-error";

        return (
          <li key={stat.itemType} className="bg-surface-container rounded-xl p-space-md">
            <div className="flex items-center justify-between gap-space-sm">
              <span className="rounded bg-surface-container-highest px-2 py-0.5 font-code-md text-code-md text-on-surface">
                {stat.itemType}
              </span>
              <span className={cn("rounded px-2 py-0.5 font-label-sm text-label-sm", tone)}>
                {stat.status === "good"
                  ? "Tốt"
                  : stat.status === "ok"
                    ? "Đạt"
                    : "Cần cải thiện"}
              </span>
            </div>

            <p className="mt-space-sm font-headline-sm text-headline-sm text-on-surface tabular">
              {stat.correct}/{stat.total}
            </p>

            <span className="mt-space-sm block h-1.5 overflow-hidden rounded bg-surface-container-highest">
              <span
                className="block h-full rounded"
                style={{
                  width: `${pct}%`,
                  backgroundColor:
                    stat.status === "good"
                      ? "var(--color-primary)"
                      : stat.status === "ok"
                        ? "var(--color-tertiary)"
                        : "var(--color-error)",
                }}
              />
            </span>

            <p className="mt-space-xs font-label-sm text-label-sm text-outline tabular">
              {pct}% đúng
              {stat.avgSeconds !== null ? ` · ${stat.avgSeconds}s/câu` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
