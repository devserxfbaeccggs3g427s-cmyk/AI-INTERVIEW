import { DailySlotCard } from "@/components/daily-loop/daily-slot-card";
import type { PlanSlotDTO } from "@/lib/daily-loop";

/**
 * Daily slot list — 6 slot cố định (task §19).
 *
 * ⚠️ Bất biến: luôn đúng 6 slot theo thứ tự ưu tiên trong ngày. Không thêm,
 * không bớt, không sắp xếp lại — thứ tự là thứ tự ưu tiên đã quyết định.
 */
export interface DailySlotListProps {
  items: PlanSlotDTO[];
  /** Ngày (yyyy-MM-dd) — truyền từ Server Component để client không lệch múi giờ. */
  date: string;
  isToday: boolean;
}

export function DailySlotList({ items, date, isToday }: DailySlotListProps) {
  return (
    <div className="mt-space-md space-y-space-md">
      {items.map((item) => (
        <DailySlotCard
          key={item.slot}
          item={item}
          date={date}
          isToday={isToday}
          hasPlan
        />
      ))}
    </div>
  );
}
