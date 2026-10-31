import { Icon } from "@/components/ui/icon";
import type { WeeklyEnergy } from "@/lib/daily-loop";
import type { StageProgressExtended } from "@/lib/daily-loop";

/**
 * Top analytical status strip (S01) — ngày · streak · năng lượng tuần.
 *
 * Streak = số ngày liên tiếp có **hành động thật** (không phải số ngày mở app).
 * Năng lượng tuần đi kèm để thấy chất lượng chứ không chỉ số đếm (P7).
 */
export interface DailyTopStripProps {
  dateLabel: string;
  streak: number;
  weeklyEnergy: WeeklyEnergy;
  isToday: boolean;
  /** Lộ trình 3 giai đoạn (Q4) — null khi chưa có dữ liệu. */
  stage?: StageProgressExtended | null;
}

export function DailyTopStrip({
  dateLabel,
  streak,
  weeklyEnergy,
  isToday,
  stage,
}: DailyTopStripProps) {
  return (
    <section
      aria-label="Thanh trạng thái"
      className="flex flex-wrap items-center justify-between gap-space-md"
    >
      <div className="flex items-center gap-space-sm">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Daily Loop OS
        </span>
        <span className="font-headline-sm text-headline-sm text-on-surface">{dateLabel}</span>
        {!isToday && (
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-tertiary">
            Chế độ xem lại
          </span>
        )}
      </div>

      <div className="flex items-center gap-space-md">
        <span className="inline-flex items-center gap-1 font-code-md text-code-md text-primary tabular">
          <Icon name="local_fire_department" size={16} />
          {streak}
          <span className="font-label-sm text-label-sm text-outline">ngày</span>
        </span>

        <span className="inline-flex items-center gap-1 font-code-md text-code-md text-secondary tabular">
          <Icon name="electric_bolt" size={16} />
          {weeklyEnergy.hasData ? `${weeklyEnergy.pct}%` : "—"}
          <span className="font-label-sm text-label-sm text-outline">năng lượng tuần</span>
        </span>

        {/* Lộ trình 3 giai đoạn (FR-DL-09) — tiêu chí đo được, không deadline. */}
        {stage && (
          <span
            title={`${stage.stage.criteria.condition} — ${stage.stage.criteria.criteria}`}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant"
          >
            <Icon name="flag" size={12} className="text-primary" />
            Giai đoạn {stage.stage.id} · {stage.stage.name}
            <span className="font-code-md text-code-md text-primary tabular">{stage.pct}%</span>
          </span>
        )}
      </div>
    </section>
  );
}
