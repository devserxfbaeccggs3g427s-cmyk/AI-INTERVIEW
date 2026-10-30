"use client";

import { Button, cn } from "@/components/ui/Button";

/**
 * S10 `GradeButtons` — 4 nút chấm thẻ FSRS.
 *
 * Nút: Lại (1) · Khó (2) · Tốt (3) · Dễ (4).
 * Hiển thị khoảng cách ôn kế tiếp cho từng rating (tính preview).
 * Disable khi đang chờ response API.
 *
 * Xem tasks.md 10.9 · design.md §4.10 · FR-SR-02.
 */

interface GradeButtonsProps {
  /** Callback khi chọn rating. */
  onGrade: (rating: 1 | 2 | 3 | 4) => void;
  /** Đang chờ API → disable nút. */
  loading?: boolean;
  /** Khoảng cách ôn kế tiếp cho mỗi rating (preview). */
  nextIntervals?: Record<number, string>;
}

const GRADE_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Lại",
  2: "Khó",
  3: "Tốt",
  4: "Dễ",
};

const GRADE_TONES: Record<1 | 2 | 3 | 4, "danger" | "secondary" | "primary" | "secondary"> = {
  1: "danger",
  2: "secondary",
  3: "primary",
  4: "secondary",
};

export function GradeButtons({
  onGrade,
  loading = false,
  nextIntervals,
}: GradeButtonsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-gutter",
        "w-full max-w-md mx-auto",
      )}
      role="group"
      aria-label="Chấm thẻ FSRS"
    >
      {([1, 2, 3, 4] as const).map((rating) => (
        <Button
          key={rating}
          variant={GRADE_TONES[rating]}
          size="lg"
          className={cn(
            "flex flex-col items-center gap-space-xs",
            "min-h-[80px]",
            "transition-all",
            "hover:scale-[1.02]",
          )}
          onClick={() => onGrade(rating)}
          disabled={loading}
          aria-label={`${GRADE_LABELS[rating]} — ôn lại sau ${nextIntervals?.[rating] ?? "?"}`}
        >
          <span className="font-label-lg text-on-surface">
            {GRADE_LABELS[rating]}
          </span>
          {nextIntervals?.[rating] && (
            <span className="font-body-xs text-on-surface-variant/70">
              Ôn lại sau {nextIntervals[rating]}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}