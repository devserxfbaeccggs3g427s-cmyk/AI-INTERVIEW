"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * Bộ chọn ngày — 7 ngày gần nhất (task 24.4).
 *
 * Ngày khác hôm nay ⇒ mở chế độ **xem lại read-only** (server chặn đánh dấu
 * hoàn thành cho ngày không phải hôm nay).
 *
 * Dùng `<Link>` thay vì `router.push` để có thể render server-side và không
 * cần JS để đổi ngày.
 */
export interface DatePickerProps {
  /** Ngày hôm nay (yyyy-MM-dd). */
  todayKey: string;
  /** Ngày đang chọn (yyyy-MM-dd). */
  selectedKey: string;
  /** Số ngày hiển thị (mặc định 7). */
  days?: number;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/** Ngày trước `key` nhiều ngày (dùng UTC noon để tránh lệch múi giờ). */
function shiftDays(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function DatePicker({ todayKey, selectedKey, days = 7 }: DatePickerProps) {
  // Bao gồm cả hôm nay và 6 ngày trước.
  const options = Array.from({ length: days }, (_, index) => {
    const offset = index - (days - 1);
    const key = shiftDays(todayKey, offset);
    const [year, month, day] = key.split("-").map(Number);
    const weekday = WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return { key, day, month, weekday, offset };
  }).reverse();

  return (
    <nav aria-label="Chọn ngày" className="flex flex-wrap gap-space-xs">
      {options.map((option) => {
        const isSelected = option.key === selectedKey;
        const isToday = option.key === todayKey;

        return (
          <Link
            key={option.key}
            href={option.key === todayKey ? "/" : `/?date=${option.key}`}
            aria-current={isSelected ? "date" : undefined}
            className={cn(
              "flex min-w-[3.25rem] flex-col items-center rounded-lg px-2 py-1.5 transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isSelected
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            {/* KHÔNG dùng `opacity` — làm giảm contrast xuống 3.65:1 (dưới
                ngưỡng WCAG AA 4.5:1 cho chữ nhỏ). */}
            <span className="font-label-sm text-label-sm uppercase tracking-wider">
              {option.weekday}
            </span>
            <span className="font-code-md text-code-md tabular">{option.day}</span>
            {isToday && (
              <span className="font-label-sm text-label-sm uppercase tracking-wider">
                Hôm nay
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
