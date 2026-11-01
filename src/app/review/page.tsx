import { WeeklyReviewReport } from "@/components/review/weekly-review-report";
import { isAiAvailable } from "@/lib/anthropic";
import { getWeeklySummary } from "@/lib/analytics";
import { getStoredInsights, nextWeekKey } from "@/lib/weekly-review";
import { formatWeekLabel, isValidIsoWeek, lastCompletedWeek } from "@/lib/week";

export const dynamic = "force-dynamic";

/**
 * S13 — Báo cáo tuần.
 *
 * ⚠️ Mặc định hiển thị tuần **đã chốt** gần nhất (Chủ Nhật 20:00).
 * ⚠️ Render server-side số liệu (không chờ AI).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;

  const requested = params.week;
  const week =
    requested && isValidIsoWeek(requested) ? requested : lastCompletedWeek();

  const summary = await getWeeklySummary(week);
  if (!summary) {
    return (
      <p className="font-body-md text-body-md text-on-surface-variant">
        Không tải được báo cáo tuần. Thử tải lại trang.
      </p>
    );
  }

  const stored = await getStoredInsights(week);
  const nextWeek = nextWeekKey(week);

  return (
    <WeeklyReviewReport
      summary={summary}
      priorInsights={stored?.insights ?? null}
      priorPlan={stored?.plan ?? null}
      hasApiKey={isAiAvailable()}
      isDue={lastCompletedWeek() === week}
      week={week}
      nextWeek={nextWeek}
      nextWeekLabel={formatWeekLabel(nextWeek)}
    />
  );
}
