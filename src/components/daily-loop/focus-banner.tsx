import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { FocusSkill } from "@/lib/daily-loop";
import { EVIDENCE_THRESHOLD } from "@/lib/config";

/**
 * Focus banner — mục tiêu hạt nhân + tiến trình tiêu chí (task §20).
 *
 * Server Component (không có `onClick`) ⇒ link tới `/skills/[id]` để mở
 * S04 (Chi tiết kỹ năng).
 *
 * ⚠️ P3 — tiến độ là **bằng chứng**, không phải % hoàn thành. Progressbar ở đây
 * là (bằng chứng mạnh / ngưỡng) — luôn kèm con số ngưỡng để người dùng biết
 * cần bao nhiêu nữa.
 */
export interface FocusBannerProps {
  focus: FocusSkill | null;
}

export function FocusBanner({ focus }: FocusBannerProps) {
  return (
    <div className="rounded-xl bg-surface-container p-space-lg shadow-md">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        Mục tiêu hạt nhân
      </span>

      {focus ? (
        <>
          <h2 className="mt-space-sm font-headline-lg text-headline-lg text-on-surface">
            <Link
              href={`/skills/${focus.skill.id}`}
              className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {focus.skill.name}
              <Icon name="arrow_outward" size={16} className="ml-1 inline-block" />
            </Link>
          </h2>

          <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
            Mức {focus.skill.level}/{focus.skill.targetLevel} ·{" "}
            {focus.strongEvidenceCount} bằng chứng mạnh · {focus.minutesAccumulated} phút tích
            lũy
          </p>

          <div
            role="progressbar"
            aria-valuenow={focus.criteriaProgressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiến trình hoàn thiện tiêu chí"
            className="mt-space-xs flex h-2 w-full gap-1 overflow-hidden rounded bg-surface-container-highest p-0.5"
          >
            <div
              className="h-full rounded-sm bg-primary"
              style={{ width: `${focus.criteriaProgressPct}%` }}
            />
            <div className="h-full flex-1 rounded-sm bg-surface-variant" />
          </div>

          <p className="mt-space-xs font-label-sm text-label-sm text-outline">
            Cần {EVIDENCE_THRESHOLD} bằng chứng (rating ≥ 3) để lên 1 bậc
          </p>
        </>
      ) : (
        <p className="mt-space-sm font-headline-md text-headline-md text-on-surface">
          Chưa có cây kỹ năng
        </p>
      )}
    </div>
  );
}
