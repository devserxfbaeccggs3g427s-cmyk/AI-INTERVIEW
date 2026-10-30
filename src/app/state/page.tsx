/**
 * S12 — Đánh giá chính `/state` (tasks.md 8.1 / 8.2 / 8.5).
 *
 * Server Component + 1 server action `saveDailyState`:
 *   - Upsert `DailyState` theo `date` (unique) → không tạo bản ghi trùng cùng ngày
 *     (task 8.2).
 *   - `revalidatePath("/state")` sau khi ghi để server render lại biểu đồ + chấm 7 ngày.
 *
 * ⚠️ NFR-08 (P6 STRICT_LOCAL): trang này **không** gọi AI cho dữ liệu sinh trắc.
 * Mọi phép tính tương quan diễn ra cục bộ (design.md §6.1 — task `biometric_correlate`
 * là local).
 *
 * Xem design.md §4.12 · requirements.md FR-PS-01 / FR-PS-05 / FR-PS-07, US-10.
 */

import { DataSentCard } from "@/components/daily-loop/DataSentCard";
import { StateLogger, type StateDay } from "@/components/daily-loop/StateDots";
import { Chip } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { addDays, dateKey, startOfDay, weekdayShort } from "@/lib/dates";
import { saveDailyState } from "@/lib/settings-daily-state";

/** Số ngày hiển thị trong ma trận chấm (task 8.3). */
const DOT_WINDOW = 7;

/** Số ngày tải sẵn cho biểu đồ — đủ cho cửa sổ 30 ngày (task 8.5). */
const CHART_WINDOW = 30;

/** Giá trị mặc định khi chưa có dữ liệu hôm qua (prefill). */
const DEFAULTS = { mood: 3, energy: 3, focus: 3, sleep: 7 };

export default async function StatePage() {
  const today = startOfDay();
  const todayKey = dateKey(today);

  // Lấy 30 ngày gần nhất (bao gồm hôm nay) — đủ dữ liệu cho cả 2 cửa sổ.
  const from = startOfDay(addDays(today, -(CHART_WINDOW - 1)));

  const [states, doneCounts] = await Promise.all([
    prisma.dailyState.findMany({
      where: { date: { gte: from, lte: today } },
      orderBy: { date: "asc" },
    }),
    prisma.planItem.groupBy({
      by: ["date"],
      where: { done: true, date: { gte: from, lte: today } },
      _count: { _all: true },
    }),
  ]);

  const stateByDate = new Map(states.map((state) => [dateKey(state.date), state]));
  const doneByDate = new Map(
    doneCounts.map((row) => [dateKey(row.date), row._count._all] as const),
  );

  // ── Ma trận 7 ngày gần nhất (kết thúc ở hôm nay) ────────────────────────
  // ⚠️ KHÔNG dùng `lastNWeekdays()` của `src/lib/dates.ts`:
  //   Hàm đó trả **tuần ISO đầy đủ** (T2 → CN) kéo về trước, không phải
  //   "7 ngày liên tiếp kết thúc ở hôm nay" — dùng nó sẽ hiện ngày tương lai
  //   trong tuần (ví dụ hôm nay là T5 thì vẫn hiện T6, T7 chưa tới).
  //   Task 8.3 cần cửa sổ **kết thúc ở hôm nay** → dựng thủ công bằng `addDays`.
  const dotDays: StateDay[] = [];
  for (let i = DOT_WINDOW - 1; i >= 0; i -= 1) {
    const day = startOfDay(addDays(today, -i));
    const key = dateKey(day);
    const state = stateByDate.get(key);
    dotDays.push({
      key,
      weekday: weekdayShort(day),
      dayLabel: `${day.getDate()}/${day.getMonth() + 1}`,
      mood: state?.mood ?? null,
      energy: state?.energy ?? null,
      focus: state?.focus ?? null,
      sleep: state?.sleep ?? null,
      note: state?.note ?? null,
      filled: state !== undefined,
      isToday: key === todayKey,
    });
  }

  // ── Dữ liệu biểu đồ (30 ngày) ─────────────────────────────────────────
  const chartDays = dotDays.length
    ? Array.from({ length: CHART_WINDOW }, (_, index) => {
        const day = startOfDay(addDays(today, -(CHART_WINDOW - 1 - index)));
        const key = dateKey(day);
        const state = stateByDate.get(key);
        return {
          key,
          label: `${day.getDate()}/${day.getMonth() + 1}`,
          mood: state?.mood ?? null,
          energy: state?.energy ?? null,
          sleep: state?.sleep ?? null,
          done: doneByDate.get(key) ?? 0,
        };
      })
    : [];

  // ── Prefill: mặc định lấy giá trị của HÔM QUA (design.md §4.12) ───────
  const yesterdayKey = dateKey(addDays(today, -1));
  const yesterday = stateByDate.get(yesterdayKey) ?? null;

  const initial = {
    mood: yesterday?.mood ?? DEFAULTS.mood,
    energy: yesterday?.energy ?? DEFAULTS.energy,
    focus: yesterday?.focus ?? DEFAULTS.focus,
    sleep: yesterday?.sleep ?? DEFAULTS.sleep,
    note: "",
  };

  // ── 3 stat (AC 10.10) ─────────────────────────────────────────────────
  const withData = dotDays.filter((day) => day.filled);
  const avgSleep =
    withData.filter((day) => day.sleep !== null).reduce((sum, day) => sum + (day.sleep ?? 0), 0) /
    Math.max(1, withData.filter((day) => day.sleep !== null).length);
  const avgScore =
    withData.length > 0
      ? withData.reduce((sum, day) => {
          const values = [day.mood, day.energy].filter((v): v is number => v !== null);
          return sum + (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);
        }, 0) / withData.length
      : 0;
  const recovery = Math.round((avgScore / 5) * 100);

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-space-md">
        <div className="flex flex-wrap items-center gap-space-md">
          <span className="font-label-sm uppercase tracking-widest text-outline">
            Phân hệ Cá nhân · Đánh giá chính (/state)
          </span>
          {/* `Badge` không hỗ trợ `icon` → dùng `Chip` (có icon) cho dải trạng thái. */}
          <Chip tone="primary" icon="lock">
            E2EE Device Storage
          </Chip>
          <Chip tone="tertiary" icon="timer">
            Ghi nhận mục tiêu: ≤15s
          </Chip>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-gutter">
          <div>
            <h1 className="font-headline-lg text-on-surface">
              Theo Dõi Trạng Thái &amp; Chỉ Số Sinh Học Cá Nhân
            </h1>
            <p className="mt-space-xs text-body-md text-on-surface-variant">
              FR-PS-01 · Ghi 4 chỉ số trong ≤15 giây — dữ liệu chỉ nằm trên máy này.
            </p>
          </div>

          <div className="flex flex-wrap gap-gutter">
            <StatMini label="Điểm phục hồi" value={`${recovery}%`} icon="pace" />
            <StatMini label="Ngủ TB" value={`${avgSleep.toFixed(1)}h`} icon="bedtime" />
            <StatMini
              label="Độ ổn định"
              value={withData.length >= 4 ? "Cao" : withData.length > 0 ? "Trung bình" : "—"}
              icon="insights"
            />
          </div>
        </div>
      </div>

      {/* ── Form + biểu đồ ─────────────────────────────────────────────── */}
      <StateLogger
        days={dotDays}
        chartDays={chartDays}
        initial={initial}
        initialDate={todayKey}
        saveAction={saveDailyState}
      />

      {/* ── Card "Dữ liệu đã gửi lên" (task 8.6) ────────────────────────── */}
      <DataSentCard />
    </div>
  );
}

/** Stat nhỏ dùng cho dải KPI đầu trang (AC 10.10). */
function StatMini({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-gutter py-space-md">
      <div className="flex items-center gap-1.5 text-on-surface-variant">
        <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
          {icon}
        </span>
        <span className="font-label-sm uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 font-headline-md text-on-surface">{value}</div>
    </div>
  );
}
