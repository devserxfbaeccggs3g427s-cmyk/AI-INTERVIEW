"use client";

import { DOMAIN_LABELS, type DomainKey } from "@/lib/types";

export interface PracticeTimeBarProps {
  practiceTime: Array<{ domain: DomainKey; minutes: number }>;
  totalMinutes: number;
}

/**
 * Thời gian deliberate practice (FR-PR-04).
 *
 * ⚠️ FR-PR-07 / P7: **không** hiển thị "tổng giờ học" trần trụi — mỗi bar gắn
 * với domain, tổng có nhãn "100% Focused".
 */
export function PracticeTimeBar({ practiceTime, totalMinutes }: PracticeTimeBarProps) {
  if (practiceTime.length === 0 || totalMinutes === 0) {
    return (
      <div className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Thời gian deliberate practice
        </h2>
        <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
          Chưa có hoạt động nào gắn kỹ năng trong khoảng này — hoạt động không
          gắn kỹ năng không được tính vào giờ thực chiến.
        </p>
      </div>
    );
  }

  const sorted = [...practiceTime].sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="bg-surface-container p-space-lg rounded-xl">
      <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
        Thời gian deliberate practice
      </h2>

      <ul className="mt-space-md space-y-space-sm">
        {sorted.map((row) => {
          const pct = totalMinutes > 0 ? (row.minutes / totalMinutes) * 100 : 0;
          return (
            <li key={row.domain} className="flex items-center gap-space-md">
              <span className="w-28 shrink-0 font-body-sm text-body-sm text-on-surface">
                {DOMAIN_LABELS[row.domain]}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-surface-container-highest">
                <span
                  className="block h-full rounded bg-secondary"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </span>
              <span
                className="w-24 shrink-0 text-right font-code-md text-code-md tabular text-on-surface-variant"
                aria-label={`${DOMAIN_LABELS[row.domain]} ${(row.minutes / 60).toFixed(1)} giờ`}
              >
                {(row.minutes / 60).toFixed(1)}h · {pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-space-md font-label-md text-label-md text-on-surface">
        Tổng thực chiến hữu ích: {(totalMinutes / 60).toFixed(1)} giờ — 100% Focused
      </p>
    </div>
  );
}
