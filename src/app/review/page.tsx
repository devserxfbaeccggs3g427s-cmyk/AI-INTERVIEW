/**
 * S13 — Báo cáo tuần & AI đề xuất (tasks.md 15.1–15.8).
 *
 * Server Component — dữ liệu tổng hợp lấy từ server, truyền xuống client.
 * Client interactions (export JSON, chỉnh sửa slot, áp dụng) qua các component
 * con là `"use client"`.
 *
 * Xem design.md §4.13 · tasks.md 15.1–15.8 · FR-WR-01..06.
 */

import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";

// Components
import { InsightList, type Insight } from "@/components/review/InsightList";
import { PlanProposal, type PlanSlot } from "@/components/review/PlanProposal";
import { WeeklyReportSkeleton } from "./_components/WeeklyReportSkeleton";
import { WeeklyReportClient } from "./_components/WeeklyReportClient";
import { ExportJsonButton } from "./_components/ExportJsonButton";

// Domain / types
import type { Domain } from "@/lib/types";

// Export type re-export for client component boundary
export type { PlanSlot };

// ────────────────────────────────────────────────────────────────────────────
// Server-side data fetching
// ────────────────────────────────────────────────────────────────────────────

/** Đóng gói summary + comparison + run-state + navigation để truyền vào client. */
export type ReviewPayload = {
  summary: {
    weekKey: string;
    start: Date;
    end: Date;
    activityCount: number;
    totalMinutes: number;
    planDone: number;
    planTotal: number;
    completionRate: number;
    domainCounts: Record<Domain, number>;
    domainMinutes: Record<Domain, number>;
    topSkills: Array<{ id: string; name: string; count: number; minutes: number }>;
    avgMood: number | null;
    avgSleep: number | null;
    avgEnergy: number | null;
    stateDays: number;
    srsReviews: number;
    dueCards: number;
    missedDays: number;
    needsRelief: boolean;
  };
  previous: {
    activityCount: number;
    totalMinutes: number;
    planDone: number;
    planTotal: number;
    completionRate: number;
    avgMood: number | null;
    avgSleep: number | null;
    evidenceCount: number;
  };
  runState: {
    weekKey: string;
    exists: boolean;
    applied: boolean;
    slotCount: number;
    reliefNote: string | null;
  };
  reliefNote: string | null;
  slotCount: number;
};

/** Lấy dữ liệu tuần cho S13 — được gọi ở server component. */
async function loadReviewData(): Promise<ReviewPayload> {
  // Lazy import để tránh circular dependency.
  const {
    summarizeWeek,
    summarizePreviousWeek,
    getWeeklyRun,
    ensureWeeklyRun,
    shouldAutoRunWeeklyReview,
    plannedSlotCount,
    reliefNote,
  } = await import("@/lib/weekly");

  const now = new Date();
  const [summary, previous, runState] = await Promise.all([
    summarizeWeek(now),
    summarizePreviousWeek(now),
    getWeeklyRun(now),
  ]);

  // Task 15.2: tự động chạy Weekly Review khi Chủ Nhật 20:00 hoặc đầu tuần.
  // Flag trong DB (`runState.exists`) đảm bảo không chạy 2 lần/tuần.
  if (!runState.exists && shouldAutoRunWeeklyReview(now)) {
    await ensureWeeklyRun(now, {
      slotCount: plannedSlotCount(summary.missedDays),
      reliefNote: reliefNote(summary.missedDays),
    });
    // Re-fetch runState after ensure.
    const refreshed = await getWeeklyRun(now);
    Object.assign(runState, refreshed);
  }

  return {
    summary,
    previous,
    runState,
    reliefNote: reliefNote(summary.missedDays),
    slotCount: plannedSlotCount(summary.missedDays),
  };
}

/**
 * Format ngày giờ theo kiểu Việt — "Thứ Hai, 27/10 → CN, 02/11".
 */
function formatWeekRange(start: Date, end: Date): string {
  const fmt = (d: Date) => {
    const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const w = weekdays[d.getDay()];
    return `${w} ${d.getDate()}/${d.getMonth() + 1}`;
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Server Component
// ────────────────────────────────────────────────────────────────────────────

export default async function ReviewPage() {
  let payload: ReviewPayload | null = null;
  let error: string | null = null;

  try {
    payload = await loadReviewData();
  } catch (e) {
    error = e instanceof Error ? e.message : "Lỗi tải dữ liệu";
  }

  const weekLabel = payload ? formatWeekRange(payload.summary.start, payload.summary.end) : "";

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Báo cáo tuần · AI-07"
        title="Báo cáo tuần & AI đề xuất"
        description="Tổng hợp tuần, chỉ ra điểm mạnh/yếu và đề xuất kế hoạch cho tuần sau."
        actions={
          <div className="flex flex-wrap items-center gap-space-sm">
            {payload && (
              <WeeklyExportButton payload={payload} weekLabel={weekLabel} />
            )}
          </div>
        }
      />

      {error ? (
        <p className="text-body-md text-error">Lỗi tải dữ liệu: {error}</p>
      ) : payload ? (
        <Suspense fallback={<WeeklyReportSkeleton />}>
          <WeeklyReportClient payload={payload} />
        </Suspense>
      ) : (
        <WeeklyReportSkeleton />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Export JSON button — uses client component for Blob download
// ────────────────────────────────────────────────────────────────────────────

function WeeklyExportButton({
  payload,
  weekLabel,
}: {
  payload: ReviewPayload;
  weekLabel: string;
}) {
  return (
    <ExportJsonButton payload={payload} weekLabel={weekLabel} />
  );
}
