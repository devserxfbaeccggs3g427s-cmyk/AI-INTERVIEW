import { getLogHistory } from "@/lib/log";
import { parseDateKey, toDateKey } from "@/lib/dates";

import { LogHistory } from "@/components/quick-log/log-history";

export const dynamic = "force-dynamic";

/**
 * S05 — Lịch sử quick-log (`/log/history`).
 *
 * ⚠️ Mặc định hôm nay; có thể xem ngày khác qua `?date=`.
 */
export default async function LogHistoryPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await props.searchParams;

  const today = toDateKey(new Date());
  const date = parseDateKey(dateParam ?? today) ?? new Date();
  const dateKey = toDateKey(date);

  const { items, total } = await getLogHistory({ date, limit: 100 });

  return (
    <div className="space-y-gutter-lg">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Lịch sử ghi nhanh
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {dateKey}
        </p>
      </header>

      <LogHistory date={dateKey} initialItems={items} initialTotal={total} />
    </div>
  );
}
