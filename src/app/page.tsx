import { prisma } from "@/lib/db";
import {
  getFocusSkill,
  getLatestAiFailure,
  getPlanForDate,
  getStageProgress,
} from "@/lib/daily-loop";
import { parseDateKey, toDateKey } from "@/lib/dates";
import { env } from "@/lib/env";

import { AiErrorBanner } from "@/components/daily-loop/ai-error-banner";
import { BioPanel } from "@/components/daily-loop/bio-panel";
import { DailyActions } from "@/components/daily-loop/daily-actions";
import { DailySlotList } from "@/components/daily-loop/daily-slot-list";
import { DailyTopStrip } from "@/components/daily-loop/daily-top-strip";
import { DatePicker } from "@/components/daily-loop/date-picker";
import { EmptyPlanCta } from "@/components/daily-loop/empty-plan-cta";
import { FocusBanner } from "@/components/daily-loop/focus-banner";
import { MetricsRow } from "@/components/daily-loop/metrics-row";
import { WeekStreakWidget } from "@/components/daily-loop/week-streak-widget";
import { WeeklyRhythm } from "@/components/daily-loop/weekly-rhythm";

export const dynamic = "force-dynamic";

/**
 * S01 — Daily Loop (trang chủ duy nhất, P1).
 *
 * Server Component: đọc dữ liệu song song, render bento 8+4 + danh sách 6 slot.
 * Không chứa `onClick` — mọi tương tác nằm ở component Client con.
 */
export default async function DailyLoopPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await props.searchParams;

  const todayKey = toDateKey(new Date());
  const date = parseDateKey(dateParam ?? todayKey) ?? new Date();
  const resolvedKey = toDateKey(date);
  const isToday = resolvedKey === todayKey;

  const dbReady = await checkDb();

  const [plan, focusSkill, dailyState, stage, aiFailure] = await Promise.all([
    dbReady ? getPlanForDate(date) : null,
    dbReady ? getFocusSkill(date) : null,
    dbReady
      ? prisma.dailyState.findUnique({
          where: { date },
          select: { mood: true, energy: true, sleep: true, focus: true },
        })
      : null,
    dbReady ? getStageProgress() : null,
    dbReady ? getLatestAiFailure() : null,
  ]);

  if (!plan) {
    return <DbNotReady />;
  }

  const hasPlan = plan.items.length > 0;

  return (
    <div className="space-y-gutter-lg">
      {/* Top strip — ngày · streak · năng lượng tuần */}
      <DailyTopStrip
        dateLabel={formatDateVi(date)}
        streak={plan.streak}
        weeklyEnergy={plan.weeklyEnergy}
        isToday={isToday}
        stage={stage}
      />

      <h1 className="sr-only">Daily Loop OS — {formatDateVi(date)}</h1>

      {/* Bộ chọn ngày — 7 ngày gần nhất (task 24.4) */}
      <DatePicker todayKey={todayKey} selectedKey={resolvedKey} />

      {/* Bento 8 + 4 */}
      <section
        aria-label="Mục tiêu hạt nhân hôm nay"
        className="grid grid-cols-1 gap-gutter-md xl:grid-cols-12"
      >
        {/* Bento trái — 8 cột: mục tiêu hạt nhân + 4 metric */}
        <div className="xl:col-span-8">
          <FocusBanner focus={focusSkill} />
          <MetricsRow focus={focusSkill} isOffline={env.isOffline} />
        </div>

        {/* Bento phải — 4 cột: sinh trắc & nhịp độ */}
        <BioPanel
          mood={dailyState?.mood ?? null}
          energy={dailyState?.energy ?? null}
          sleep={dailyState?.sleep ?? null}
          focus={dailyState?.focus ?? null}
        />
      </section>

      {/* Banner offline — kế hoạch sinh bằng rule cục bộ */}
      {plan.source === "fallback" && hasPlan && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-space-sm rounded-xl bg-tertiary/10 p-space-md"
        >
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-tertiary">
            Đang dùng kế hoạch offline
          </span>
          <span className="text-body-sm text-body-sm text-on-surface-variant">
            Kế hoạch được sinh bằng rule cục bộ — thêm API key để AI tối ưu thời lượng.
          </span>
        </div>
      )}

      {/* AI lỗi ⇒ kế hoạch fallback + nút "Thử lại" (task 24.3 / AC-DL-6) */}
      {aiFailure && (
        <AiErrorBanner date={resolvedKey} message={aiFailure.message} />
      )}

      {/* Banner offline mode (chưa có key) */}
      {env.isOffline && (
        <div
          role="status"
          className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-md"
        >
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Offline mode
          </span>
          <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
            Chưa có <code className="font-code-md text-code-md">ANTHROPIC_API_KEY</code> — tính năng
            AI dùng bộ sinh rule cục bộ. Thêm key trong{" "}
            <code className="font-code-md text-code-md">.env.local</code> rồi khởi động lại server.
          </p>
        </div>
      )}

      {/* Hành động chính: ghi nhanh + lập lại kế hoạch */}
      <DailyActions
        date={resolvedKey}
        isToday={isToday}
        energyPct={plan.weeklyEnergy.pct}
        doneCount={plan.doneCount}
        items={plan.items}
      />

      {/* Danh sách 6 slot */}
      <section aria-label="Hành động hôm nay">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            6 hành động nhỏ hôm nay
          </h2>
          {hasPlan && (
            <span className="rounded-full bg-surface-container-high px-3 py-1 font-label-md text-label-md text-primary">
              {plan.doneCount} / {plan.totalCount} đã xong
            </span>
          )}
        </div>

        {hasPlan ? (
          <DailySlotList items={plan.items} date={resolvedKey} isToday={isToday} />
        ) : (
          <div className="mt-space-md">
            <EmptyPlanCta date={resolvedKey} isToday={isToday} />
          </div>
        )}
      </section>

      {/* Nhịp tuần & streak */}
      <WeeklyRhythm weeklyEnergy={plan.weeklyEnergy} streak={plan.streak} />

      <WeekStreakWidget weeklyEnergy={plan.weeklyEnergy} streak={plan.streak} />
    </div>
  );
}

/** Kiểm tra DB sẵn sàng — nếu chưa migrate thì hiện hướng dẫn, không crash. */
async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Trạng thái DB chưa sẵn sàng. */
function DbNotReady() {
  return (
    <div className="space-y-gutter-lg">
      <div
        role="status"
        className="rounded-xl border border-tertiary/30 bg-tertiary/10 p-space-lg"
      >
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-tertiary">
          Cần thiết lập
        </span>
        <p className="mt-space-sm text-body-md text-body-md text-on-surface">
          Database chưa sẵn sàng. Chạy lệnh sau rồi tải lại trang:
        </p>
        <code className="mt-space-sm block rounded-lg bg-surface-container-lowest p-space-md font-code-md text-code-md text-primary">
          npm run db:migrate &amp;&amp; npm run db:seed
        </code>
      </div>
    </div>
  );
}

const WEEKDAY_VI = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

function formatDateVi(date: Date): string {
  return `${WEEKDAY_VI[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}
