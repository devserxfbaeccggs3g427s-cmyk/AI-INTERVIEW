"use client";

import { cn } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Chip";
import type { LevelCriterion } from "@/lib/skills-data";

/**
 * "Tiêu chuẩn thăng cấp" (task 7.11).
 *
 * Với mỗi level từ `current + 1` → `targetLevel`, tick đạt khi số bằng chứng
 * `rating >= 3` đã đạt ngưỡng `LEVEL_THRESHOLDS[level]` (FR-SK-03).
 *
 * Xem tasks.md 7.11 · design.md §4.4 · FR-SK-03.
 */

export function LevelChecklist({
  criteria,
  currentLevel,
  targetLevel,
  qualifyingCount,
  className,
}: {
  /** Danh sách tiêu chí đã dựng sẵn ở server (`buildLevelChecklist`). */
  criteria: LevelCriterion[];
  currentLevel: number;
  targetLevel: number;
  /** Số bằng chứng chất lượng (rating >= 3) hiện có. */
  qualifyingCount: number;
  className?: string;
}) {
  // Ngưỡng của level kế tiếp = mốc bằng chứng cần đạt để lên level đó.
  const nextCriterion = criteria[0];
  const nextRequired = nextCriterion?.required ?? 0;
  const progress =
    nextRequired > 0
      ? Math.min(100, Math.round((qualifyingCount / nextRequired) * 100))
      : 100;

  return (
    <Card tone="base" className={className} data-testid="level-checklist">
      <CardHeader
        title="Tiêu chuẩn thăng cấp"
        subtitle={`Mục tiêu cấp ${targetLevel} · hiện tại cấp ${currentLevel}`}
        icon="checklist"
      />

      {criteria.length === 0 ? (
        <p className="text-body-sm text-outline">
          Đã đạt mục tiêu cấp {targetLevel}. Không còn tiêu chí nào để mở khoá.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter">
            <div className="flex items-baseline justify-between gap-space-sm">
              <Label>Cần cho level {nextCriterion?.level}</Label>
              <span className="font-code-md text-label-md text-on-surface">
                {qualifyingCount} / {nextRequired}
              </span>
            </div>
            <ProgressBar value={progress} className="mt-space-sm" />
            <p className="mt-space-sm text-body-sm text-on-surface-variant">
              {Math.max(0, nextRequired - qualifyingCount)} bằng chứng còn thiếu
            </p>
          </div>

          <ul className="mt-gutter space-y-space-md">
            {criteria.map((c) => (
              <li key={c.level} className="flex items-start gap-space-md">
                <span
                  className={cn(
                    "material-symbols-outlined shrink-0",
                    c.done ? "text-primary" : "text-outline",
                  )}
                  aria-hidden
                >
                  {c.done ? "check_circle" : "radio_button_unchecked"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-space-sm">
                    <span className="font-label-md text-on-surface">
                      Lên cấp {c.level} — cần {c.required} bằng chứng (≥ 3★)
                    </span>
                    <span
                      className={cn(
                        "font-code-md text-label-sm",
                        c.done ? "text-primary" : "text-outline",
                      )}
                    >
                      {c.done ? "Đạt" : `${Math.min(c.current, c.required)}/${c.required}`}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    {c.done
                      ? "Đã đủ bằng chứng chất lượng cho mốc này."
                      : `Cần thêm ${Math.max(0, c.required - c.current)} bằng chứng có rating từ 3 trở lên.`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
