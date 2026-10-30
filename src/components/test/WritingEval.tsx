"use client";

import { cn } from "@/lib/cn";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { color } from "@/styles/tokens";
import { RUBRIC_LANGUAGE_ERRORS } from "@/lib/rubrics";

/**
 * `WritingEval` — bảng điểm 4 tiêu chí writing/translation ra 10 điểm (task 14.18).
 *
 * Mỗi tiêu chí: 0..10 (chia thành 4 phần: xuất sắc, tốt, cần cải thiện, chưa đạt).
 * Tổng = 10.
 *
 * Props:
 *  - score: điểm trung bình AI (0..10) hoặc điểm tự tính.
 *  - errorGroups: nhóóc lỗi đã chuẩn hoá (grammar, vocab, expression, context).
 *  - maxScore: điểm tối đa mặc định 10.
 *
 * Xem tasks.md 14.18 · design.md §4.19 / S21.
 */

export interface WritingEvalProps {
  score: number; // 0..maxScore
  errorGroups: Record<string, Array<{ original: string; correction: string; explanation: string }>>;
  maxScore?: number;
  className?: string;
}

/** Đánh giá 4 nhóóc theo từng mức điểm. */
function scoreToLevel(score: number, max: number): { label: string; color: string } {
  const pct = score / max;
  if (pct >= 0.8) return { label: "Xuất sắc", color: color("primary") };
  if (pct >= 0.6) return { label: "Tốt", color: color("secondary") };
  if (pct >= 0.4) return { label: "Cần cải thiện", color: color("tertiary") };
  return { label: "Chưa đạt", color: color("error") };
}

export function WritingEval({ score, errorGroups, maxScore = 10, className }: WritingEvalProps) {
  const level = scoreToLevel(score, maxScore);

  // Tính phần trăm mỗi nhóóc lỗi
  const totalErrors = Object.values(errorGroups).reduce(
    (sum, errs) => sum + (errs?.length ?? 0),
    0,
  );

  return (
    <Card className={cn("bg-surface-container-low", className)} tone="low">
      <CardHeader
        title="Đánh giá bài viết"
        subtitle={`Tổng điểm: ${score}/${maxScore}`}
        icon="rate_review"
      />

      {/* Điểm tổng + trạng thái */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full font-headline-lg font-bold"
            style={{ backgroundColor: `${level.color}20`, color: level.color }}
          >
            {score}
          </div>
          <span
            className="font-label-md"
            style={{ color: level.color }}
          >
            {level.label}
          </span>
        </div>
        <div className="font-label-sm text-on-surface-variant">
          {totalErrors === 0
            ? "Không có lỗi"
            : `${totalErrors} lỗi phát hiện`}
        </div>
      </div>

      {/* 4 nhóóc lỗi */}
      <div className="space-y-3">
        <Label>Chi tiết lỗi</Label>
        {RUBRIC_LANGUAGE_ERRORS.map((group) => {
          const errors = errorGroups[group.key] ?? [];
          const groupColor = errors.length > 0 ? color("error") : color("on-surface-variant");

          return (
            <div key={group.key} className="rounded-md bg-surface-container p-3">
              <div className="flex items-center justify-between">
                <span
                  className="font-label-sm"
                  style={{ color: groupColor }}
                >
                  {group.name}
                </span>
                <span className="font-label-sm text-on-surface-variant">
                  {errors.length} lỗi
                </span>
              </div>

              {errors.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {errors.slice(0, 3).map((err, i) => (
                    <div key={i} className="font-body-sm">
                      <span className="text-on-surface-variant">"{err.original}"</span>
                      {err.correction && (
                        <>
                          <span className="text-on-surface-variant/50"> → </span>
                          <span className="text-primary">"{err.correction}"</span>
                        </>
                      )}
                      {err.explanation && (
                        <p className="mt-0.5 font-body-xs text-on-surface-variant">
                          {err.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                  {errors.length > 3 && (
                    <p className="font-body-xs text-on-surface-variant">
                      +{errors.length - 3} lỗi khác
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}