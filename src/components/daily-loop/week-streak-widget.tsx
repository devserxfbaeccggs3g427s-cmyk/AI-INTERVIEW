import type { WeeklyEnergy } from "@/lib/daily-loop";

/**
 * Week streak widget — nhịp tuần + streak (task §21).
 *
 * 7 cột = 7 ngày. Ngày có kế hoạch nhưng chưa xong slot nào ⇒ hiện màu
 * "trung tính" (không phải đỏ — đỏ ám chỉ "không có dữ liệu" khác với
 * "có kế hoạch nhưng trượt").
 */
export interface WeekStreakWidgetProps {
  weeklyEnergy: WeeklyEnergy;
  streak: number;
}

export interface DayMark {
  date: Date;
  isToday: boolean;
  /** Số slot đã xong trong ngày đó. */
  doneSlots: number;
  /** Ngày có kế hoạch hay không. */
  hasPlan: boolean;
}

export function WeekStreakWidget({ weeklyEnergy, streak }: WeekStreakWidgetProps) {
  return (
    <section
      aria-label="Nhịp tuần và chuỗi ngày"
      className="rounded-xl bg-surface-container-low p-space-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Nhịp tuần
        </h2>

        <div className="flex items-center gap-space-md">
          <span className="inline-flex items-center gap-1 font-code-md text-code-md text-secondary tabular">
            <span aria-hidden="true">🔥</span>
            {streak} ngày liên tiếp
          </span>
          <span className="inline-flex items-center gap-1 font-code-md text-code-md text-primary tabular">
            {weeklyEnergy.hasData ? `${weeklyEnergy.pct}%` : "—"}
            <span className="font-label-sm text-label-sm text-outline">năng lượng tuần</span>
          </span>
        </div>
      </div>

      <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
        {weeklyEnergy.hasData
          ? `${weeklyEnergy.doneSlots}/${weeklyEnergy.totalSlots} slot hoàn thành trong ${weeklyEnergy.daysWithPlan} ngày có kế hoạch`
          : "Chưa có dữ liệu tuần — bấm 'Xong' ở một slot để bắt đầu."}
      </p>
    </section>
  );
}
