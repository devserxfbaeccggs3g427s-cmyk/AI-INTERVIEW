"use client";

/**
 * RubricGrid — hiển thị 5 tiêu chí chấm giao tiếp (S07/S08 dùng chung).
 *
 * Mỗi tiêu chí: tên + điểm (0–5) + nhận xét + màu sắc theo mức độ.
 * Dùng chung cho S07 (viết) và S08 (nói).
 *
 * Xem tasks.md 11.4 / 18.3 · SPEC.md S07/S08.
 */

import { cn } from "@/lib/cn";
import { RUBRIC_COMMUNICATION } from "@/lib/rubrics";

/**
 * `DeltaBadge` đã tách sang file riêng (`./DeltaBadge`) — tasks.md 11.5.
 * Re-export ở đây để các import site cũ
 * (`import { DeltaBadge } from "@/components/rubric/RubricGrid"`) không phải sửa.
 */
export { DeltaBadge } from "./DeltaBadge";

export interface RubricScore {
  scores: Record<string, number>;
  comments: Record<string, string>;
  suggestions: string[];
  total: number;
}

function scoreColor(score: number): string {
  if (score >= 4) return "text-green-600 dark:text-green-400";
  if (score >= 3) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 2) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 4) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 3) return "bg-yellow-100 dark:bg-yellow-900/30";
  if (score >= 2) return "bg-orange-100 dark:bg-orange-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function RubricGrid({
  data,
  showTotal = true,
  compact = false,
}: {
  data: RubricScore;
  showTotal?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-gutter-sm", compact && "gap-gutter-xs")}>
      {RUBRIC_COMMUNICATION.map((criterion) => {
        const score = data.scores[criterion.key] ?? 0;
        const comment = data.comments[criterion.key] ?? "";
        return (
          <div
            key={criterion.key}
            className={cn(
              "flex flex-col sm:flex-row sm:items-center gap-gutter-sm p-gutter-sm rounded-xl border",
              "bg-surface-container-low border-outline-variant/40",
              compact && "p-gutter-xs"
            )}
          >
            <div className="flex items-center gap-gutter-sm min-w-[140px] shrink-0">
              <span className="font-label-md text-on-surface">{criterion.name}</span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-label-sm font-medium tabular-nums",
                  scoreBg(score),
                  scoreColor(score)
                )}
              >
                {score}/5
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm text-on-surface-variant line-clamp-2">{comment}</p>
            </div>
          </div>
        );
      })}

      {showTotal && (
        <div
          className={cn(
            "flex items-center justify-between p-gutter-md rounded-xl border",
            "bg-primary-container/20 border-primary/30",
            compact && "p-gutter-sm"
          )}
        >
          <span className="font-headline-sm text-primary">Tổng điểm</span>
          <span className="font-display-sm text-primary tabular-nums">
            {data.total.toFixed(1)}/5
          </span>
        </div>
      )}

      {data.suggestions.length > 0 && (
        <div className="rounded-xl bg-secondary-container/30 border border-secondary/30 p-gutter-md space-y-gutter-xs">
          <h4 className="font-label-lg text-on-surface">Đề xuất sửa đổi</h4>
          <ul className="space-y-1">
            {data.suggestions.map((s, i) => (
              <li
                key={i}
                className="flex gap-gutter-sm text-body-sm text-on-surface-variant"
              >
                <span className="material-symbols-rounded text-secondary shrink-0 mt-0.5">
                  arrow_forward
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version cho hiển thị trong danh sách / card nhỏ
 */
export function RubricGridCompact({
  data,
}: {
  data: RubricScore;
}) {
  return (
    <div className="grid grid-cols-5 gap-gutter-xs text-center">
      {RUBRIC_COMMUNICATION.map((criterion) => {
        const score = data.scores[criterion.key] ?? 0;
        return (
          <div
            key={criterion.key}
            className={cn(
              "p-gutter-xs rounded-lg",
              scoreBg(score)
            )}
          >
            <div className={cn("font-label-xs uppercase tracking-wider", scoreColor(score))}>
              {criterion.name}
            </div>
            <div className={cn("font-body-lg tabular-nums", scoreColor(score))}>
              {score}
            </div>
          </div>
        );
      })}
    </div>
  );
}