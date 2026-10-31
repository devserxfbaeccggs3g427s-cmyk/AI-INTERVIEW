import Link from "next/link";

import { Icon } from "@/components/ui/icon";

/**
 * Empty state S01 — chưa có kế hoạch trong ngày (FR-DL-07, AC-1).
 *
 * CTA dẫn tới S02 với ngày mang theo → S02 tự bắt đầu sinh kế hoạch.
 */
export interface EmptyPlanCtaProps {
  date: string;
  isToday: boolean;
}

export function EmptyPlanCta({ date, isToday }: EmptyPlanCtaProps) {
  return (
    <div className="rounded-xl bg-surface-container p-space-lg shadow-md">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {isToday ? "Chưa có kế hoạch hôm nay" : "Chưa có kế hoạch cho ngày này"}
      </span>

      <h3 className="mt-space-sm font-headline-md text-headline-md text-on-surface">
        Lập kế hoạch {isToday ? "hôm nay" : "cho ngày này"}
      </h3>

      <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
        6 việc nhỏ, đúng 4 trục — chuyên môn · giao tiếp · ngoại ngữ · cá nhân. Mất khoảng 10
        giây.
      </p>

      <div className="mt-space-lg">
        <Link
          href={`/plan?date=${date}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="neurology" size={18} />
          Lập kế hoạch hôm nay
        </Link>
      </div>
    </div>
  );
}
