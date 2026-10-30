"use client";

import { cn } from "@/components/ui/Button";
import { formatVnDate } from "@/lib/dates";
import { useQuickLog } from "@/components/quick-log/QuickLogProvider";

/**
 * Topbar 64px — đối chiếu 21/21 màn hình Stitch:
 * `h-16 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/30`
 * và `fixed top-0 left-72 right-0`.
 */
export function Topbar({
  streak,
  weekEnergy,
  aiChip,
  aiIsLocal,
}: {
  streak: number;
  weekEnergy: number;
  aiChip: string;
  aiIsLocal: boolean;
}) {
  const { open: openQuickLog } = useQuickLog();

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between gap-gutter",
        "border-b border-outline-variant/30 bg-surface-container-lowest/80 backdrop-blur-xl",
        "px-gutter lg:pl-72",
      )}
    >
      <div className="flex min-w-0 items-center gap-gutter">
        {/* Chip ngày */}
        <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-low px-space-md py-1.5">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "1rem" }} aria-hidden>
            calendar_today
          </span>
          <span className="font-label-md text-on-surface whitespace-nowrap">
            {formatVnDate()}
          </span>
        </div>

        {/* Streak */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="material-symbols-outlined text-tertiary" style={{ fontSize: "1rem" }} aria-hidden>
            local_fire_department
          </span>
          <span className="font-label-md font-semibold text-tertiary whitespace-nowrap">
            Streak {streak} ngày
          </span>
        </div>

        {/* Năng lượng tuần */}
        <div className="hidden items-center gap-1.5 md:flex">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "1rem" }} aria-hidden>
            bolt
          </span>
          <span className="font-label-md font-semibold text-primary whitespace-nowrap">
            Năng lượng tuần {weekEnergy}%
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-gutter">
        {/* Chip AI — nhãn phản ánh provider thật (FR-AI-11) */}
        <div
          className={cn(
            "hidden items-center gap-1.5 rounded border px-space-md py-1.5 sm:flex",
            aiIsLocal
              ? "border-secondary/20 bg-secondary-container/40 text-secondary"
              : "border-primary/25 bg-primary-container/15 text-primary",
          )}
          title={aiChip}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "0.9375rem" }} aria-hidden>
            memory
          </span>
          <span className="font-label-md whitespace-nowrap">{aiChip}</span>
        </div>

        {/* CTA Quick-log */}
        <button
          type="button"
          onClick={() => openQuickLog()}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-space-md py-2 font-label-md font-semibold",
            "bg-primary-container text-on-primary shadow-[0_0_12px_rgba(16,185,129,0.2)]",
            "transition-all hover:brightness-105 active:scale-[0.98]",
          )}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "1.125rem" }} aria-hidden>
            add_circle
          </span>
          <span className="hidden sm:inline">+ Ghi nhanh</span>
          <span className="hidden lg:inline font-label-sm opacity-70">(≤10s)</span>
        </button>

        {/* Avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-[9999px] bg-primary">
          <span className="material-symbols-outlined text-on-primary" style={{ fontSize: "1.125rem" }} aria-hidden>
            person
          </span>
        </div>
      </div>
    </header>
  );
}
