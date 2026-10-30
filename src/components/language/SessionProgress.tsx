"use client";

import { cn } from "@/lib/cn";
import { ProgressBar } from "@/components/ui/Chip";

/**
 * S10 `SessionProgress` — thanh tiến trình + nhãn "Thẻ {currentIndex} / {total}".
 *
 * Props:
 *   - currentIndex: số thứ tự bắt đầu từ 1 (thẻ hiện đang hiển thị)
 *   - total: tổng số thẻ trong batch hiện tại
 *
 * Xem tasks.md 10.10 · design.md §4.10.
 */

interface SessionProgressProps {
  /** Thẻ hiện tại (1-based). */
  currentIndex: number;
  /** Tổng số thẻ trong batch. */
  total: number;
}

export function SessionProgress({ currentIndex, total }: SessionProgressProps) {
  const pct = total > 0 ? (currentIndex / total) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-space-sm w-full max-w-md mx-auto">
      <ProgressBar value={pct} className="w-full" />
      <p className="font-body-sm text-on-surface-variant">
        Thẻ {currentIndex} / {total}
      </p>
    </div>
  );
}
