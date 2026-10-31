import { Icon } from "@/components/ui/icon";
import type { WeeklyEnergy } from "@/lib/daily-loop";

/**
 * "Nhịp tuần & Streak" — lưới 7 ngày.
 *
 * Ô đạt = `bg-primary` · ô hôm nay = `bg-tertiary` (đang diễn ra) · ô trống =
 * `bg-surface-container-highest`.
 *
 * ⚠️ Hiển thị mẫu số (x/tổng slot) để không thành vanity metric (P7).
 */
export interface WeeklyRhythmProps {
  weeklyEnergy: WeeklyEnergy;
  streak: number;
}

export function WeeklyRhythm({ weeklyEnergy, streak }: WeeklyRhythmProps) {
  const today = new Date();

  // 7 ngày gần nhất: T2..CN (tuần ISO).
  const days = Array.from({ length: 7 }, (_, i) => {
    const offset = i - 6;
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return date;
  });

  return (
    <section
      aria-label="Nhịp tuần và streak"
      className="rounded-xl bg-surface-container p-space-lg shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Nhịp tuần & streak
        </span>
        <span className="inline-flex items-center gap-1 font-label-md text-label-md text-primary tabular">
          <Icon name="local_fire_department" size={16} />
          {streak} ngày
        </span>
      </div>

      {/* Lưới 7 ô — màu theo trạng thái, không phải số liệu giả */}
      <div className="mt-space-md grid grid-cols-7 gap-space-sm">
        {days.map((date) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div key={date.toISOString()} className="flex flex-col items-center gap-space-xs">
              <span className="font-label-sm text-label-sm text-outline">
                {WEEKDAY_SHORT[date.getDay()]}
              </span>
              {/* `role="img"` BẮT BUỘC — `aria-label` trên <span> trần bị axe
                  báo `aria-prohibited-attr` (serious). */}
              <span
                role="img"
                aria-label={
                  isToday ? `${date.getDate()}/${date.getMonth() + 1} — hôm nay` : `${date.getDate()}/${date.getMonth() + 1}`
                }
                className={[
                  "h-8 w-full rounded-sm",
                  isToday ? "bg-tertiary animate-pulse" : "bg-surface-container-highest",
                ].join(" ")}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-space-md font-label-sm text-label-sm text-outline">
        {weeklyEnergy.hasData
          ? `Năng lượng tuần: ${weeklyEnergy.doneSlots}/${weeklyEnergy.totalSlots} slot đã xong · ${weeklyEnergy.daysWithPlan} ngày có kế hoạch`
          : "Chưa có dữ liệu tuần — ô trống nghĩa là chưa lập kế hoạch, không phải chưa làm gì."}
      </p>
    </section>
  );
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
