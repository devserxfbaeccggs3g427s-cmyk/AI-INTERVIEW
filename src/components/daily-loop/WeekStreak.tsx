"use client";

import { Badge } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import type { WeekDayDTO } from "@/lib/daily-loop-types";

/**
 * `WeekStreak` — 7 cột trạng thái T2→CN + chuỗi streak (task 4.3).
 *
 * Trạng thái mỗi cột:
 *   - `done`   — đã hoàn thành ít nhất 1 slot → chấm xanh (primary).
 *   - `missed` — đã qua mà chưa slot nào xong → chấm xám (outline).
 *   - `today`  — hôm nay → viền primary + nhãn "HÔM NAY".
 *   - `future` — chưa tới → nền rất mờ.
 *
 * Xem design.md §4.1 · requirements.md FR-DL-05.
 */
export function WeekStreak({
  days,
  streak,
}: {
  days: WeekDayDTO[];
  streak: number;
}) {
  return (
    <Card tone="low" className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-tertiary" aria-hidden>
            local_fire_department
          </span>
          <h3 className="font-headline-md text-on-surface">Nhịp tuần</h3>
        </div>
        <Badge tone="tertiary">Streak {streak} ngày</Badge>
      </div>

      <div className="grid grid-cols-7 gap-space-sm">
        {days.map((d) => (
          <div key={d.dateKey} className="flex flex-col items-center gap-space-xs">
            <span className="font-label-sm text-outline">{d.label}</span>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[9999px] font-label-md"
              style={dotStyle(d.state)}
              title={titleOf(d)}
              data-testid={`week-day-${d.dateKey}`}
              data-state={d.state}
              aria-label={`${d.label} ${d.day}: ${titleOf(d)}`}
            >
              {d.state === "done" ? (
                <span className="material-symbols-outlined text-on-primary" aria-hidden>
                  check
                </span>
              ) : (
                <span className="text-on-surface-variant">{d.day}</span>
              )}
            </span>
            <span className="font-label-sm text-outline">
              {d.state === "future" ? "—" : `${d.doneCount}/${d.totalCount || 0}`}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-space-md text-body-sm text-on-surface-variant">
        <LegendDot className="bg-primary" label="Đã xong" />
        <LegendDot className="bg-surface-container-highest" label="Bỏ lỡ" />
        <LegendDot className="bg-surface-container-highest ring-2 ring-primary" label="Hôm nay" />
        <LegendDot className="bg-surface-container-low" label="Tương lai" />
      </div>
    </Card>
  );
}

/** Style của chấm trạng thái — dùng token Tailwind, không hex hardcode. */
function dotStyle(state: WeekDayDTO["state"]): {
  backgroundColor: string;
  color: string;
  boxShadow?: string;
} {
  switch (state) {
    case "done":
      return { backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" };
    case "missed":
      return { backgroundColor: "var(--color-surface-container-highest)", color: "var(--color-on-surface-variant)" };
    case "today":
      return {
        backgroundColor: "var(--color-surface-container-highest)",
        color: "var(--color-on-surface)",
        boxShadow: "inset 0 0 0 2px var(--color-primary)",
      };
    default:
      return { backgroundColor: "var(--color-surface-container-low)", color: "var(--color-outline)" };
  }
}

function titleOf(d: WeekDayDTO): string {
  switch (d.state) {
    case "done":
      return `Đã xong ${d.doneCount}/${d.totalCount} slot`;
    case "missed":
      return "Bỏ lỡ";
    case "today":
      return `Hôm nay — ${d.doneCount}/${d.totalCount} slot`;
    default:
      return "Chưa tới";
  }
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-[9999px] ${className}`} aria-hidden />
      {label}
    </span>
  );
}
