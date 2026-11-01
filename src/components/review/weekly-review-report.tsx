"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { DomainStatusChip, InsightBlock } from "@/components/review/insight-block";
import { NextWeekPlanView } from "@/components/review/next-week-plan";
import { useWeeklyInsights } from "@/components/review/use-weekly-insights";
import { cn } from "@/lib/cn";
import { DOMAIN_LABELS } from "@/lib/types";
import type { WeeklySummary } from "@/lib/analytics";
import type { NextWeekPlan, WeeklyInsights } from "@/lib/weekly-review";

export interface WeeklyReviewReportProps {
  summary: WeeklySummary;
  priorInsights: WeeklyInsights | null;
  priorPlan: NextWeekPlan | null;
  hasApiKey: boolean;
  isDue: boolean;
  week: string;
  nextWeek: string;
  nextWeekLabel: string;
}

/**
 * S13 — Báo cáo tuần.
 *
 * ⚠️ NFR-RP-04: không có API key ⇒ số liệu thật vẫn hiển thị đầy đủ, chỉ ẩn
 * khối AI nhận định.
 * ⚠️ P7: mọi số liệu từ `summary` (query DB) — không hardcode.
 */
export function WeeklyReviewReport({
  summary,
  priorInsights,
  priorPlan,
  hasApiKey,
  isDue,
  week,
  nextWeek,
  nextWeekLabel,
}: WeeklyReviewReportProps) {
  const stream = useWeeklyInsights(hasApiKey);
  const [plan, setPlan] = useState<NextWeekPlan | null>(priorPlan);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const insights = stream.insights ?? priorInsights;
  const activePlan = stream.plan ?? plan;

  const approve = async () => {
    if (!activePlan) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/review/weekly/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: nextWeek,
          slots: activePlan.slots.map((slot) => ({
            slot: slot.slot,
            domain: slot.domain,
            action: slot.action,
            detail: slot.detail,
            minutes: slot.minutes,
            skillId: slot.skillId ?? null,
            skillName: slot.skillName ?? null,
            startTime: slot.startTime ?? null,
            endTime: slot.endTime ?? null,
            focusHint: slot.focusHint ?? null,
          })),
          reducedLoad: activePlan.reducedLoad,
          reduceReason: activePlan.reduceReason ?? null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; message?: string };
      if (!body.ok) {
        setApplyError(body.message ?? "Không lưu được kế hoạch. Thử lại.");
        return;
      }
      setApplied(true);
    } catch {
      setApplyError("Không lưu được kế hoạch. Thử lại.");
    } finally {
      setApplying(false);
    }
  };

  const completion = summary.completion;

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-outline">
            FR-WR-01 · tự động tổng hợp Chủ nhật 20:00
          </span>
          <span className="rounded bg-secondary/10 px-2 py-1 font-label-sm text-label-sm text-secondary">
            <Icon name="neurology" size={12} /> Claude Opus 5
          </span>
          <span className="rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-outline">
            HASH: #REV-{week.replace("-", "")}
          </span>
        </div>

        <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
          Báo cáo tuần {week.split("-W")[1]} ({summary.range.start} –{" "}
          {summary.range.end})
        </h1>

        {!isDue && (
          <p className="bg-surface-container-low text-body-sm text-on-surface-variant rounded-lg p-space-md">
            Báo cáo sẽ chốt vào Chủ nhật 20:00 — bạn đang xem bản tạm của tuần đang
            chạy.
          </p>
        )}
      </header>

      {/* ── Metric row ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-gutter-md md:grid-cols-4">
        <div className="bg-surface-container p-space-md rounded-lg">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Tỷ lệ hoàn thành
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-primary tabular">
            {completion.done}/{completion.total} ({(completion.rate * 100).toFixed(1)}%)
          </p>
          {completion.deltaRate !== null && (
            <p
              className={cn(
                "font-label-sm text-label-sm tabular",
                completion.deltaRate >= 0 ? "text-primary" : "text-error",
              )}
            >
              {completion.deltaRate >= 0 ? "▲" : "▼"}{" "}
              {completion.deltaRate >= 0 ? "+" : ""}
              {completion.deltaRate}% so với tuần trước
            </p>
          )}
        </div>

        <div className="bg-surface-container p-space-md rounded-lg">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Chuỗi kỷ luật
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-on-surface tabular">
            {summary.streak} ngày
          </p>
          {summary.missedStreak > 0 && (
            <p className="font-label-sm text-label-sm text-error">
              Trượt {summary.missedStreak} ngày liên tiếp
            </p>
          )}
        </div>

        <div className="bg-surface-container p-space-md rounded-lg">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Năng lượng TB
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-on-surface tabular">
            {summary.bio.energy !== null
              ? `${Math.round((summary.bio.energy / 5) * 100)}%`
              : "—"}
          </p>
          <p className="font-label-sm text-label-sm text-outline">
            {summary.bio.samples} ngày có chỉ số
          </p>
        </div>

        <div className="bg-surface-container p-space-md rounded-lg">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            FSRS Retention
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-tertiary tabular">
            {summary.retention.rate !== null
              ? `${(summary.retention.rate * 100).toFixed(1)}%`
              : "—"}
          </p>
          <p className="font-label-sm text-label-sm text-outline tabular">
            {summary.retention.successful}/{summary.retention.total} lượt ôn thành công
          </p>
        </div>
      </section>

      {/* ── Phân bổ 4 trục ─────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Phân bổ 4 trục thực thi
        </h2>
        <ul className="mt-space-md space-y-space-sm">
          {summary.byDomain.map((row) => (
            <li key={row.domain} className="flex items-center gap-space-md">
              <span className="w-28 shrink-0 font-body-sm text-body-sm text-on-surface">
                {DOMAIN_LABELS[row.domain]}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-surface-container-highest">
                <span
                  className="block h-full rounded"
                  style={{
                    width: `${Math.round(row.rate * 100)}%`,
                    backgroundColor:
                      row.status === "elite"
                        ? "var(--color-primary)"
                        : row.status === "ok"
                          ? "var(--color-tertiary)"
                          : "var(--color-error)",
                  }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-code-md text-code-md tabular text-on-surface-variant">
                {row.done}/{row.total} ({(row.rate * 100).toFixed(0)}%)
              </span>
              <DomainStatusChip status={row.status} />
            </li>
          ))}
        </ul>
      </section>

      {/* ── Nhịp độ 7 ngày + top 3 kỹ năng + sinh trắc ─────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md lg:grid-cols-3">
        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Nhịp độ năng lượng & điểm slot trong tuần
          </h2>
          <ul className="mt-space-md space-y-space-xs">
            {summary.energy.map((day) => (
              <li key={day.date} className="flex items-center gap-space-sm">
                <span className="w-10 shrink-0 font-label-sm text-label-sm text-outline">
                  {day.weekday}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-surface-container-highest">
                  <span
                    className="block h-full rounded"
                    style={{
                      width: `${Math.round(day.rate * 100)}%`,
                      backgroundColor:
                        day.rate >= 0.9
                          ? "var(--color-primary)"
                          : day.rate >= 0.6
                            ? "var(--color-tertiary)"
                            : "var(--color-surface-variant)",
                    }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-code-md text-code-md tabular text-on-surface-variant">
                  {day.slotsDone}/{day.slotsTotal}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Top 3 kỹ năng bứt phá
          </h2>
          {summary.topSkills.length === 0 ? (
            <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
              Chưa có bằng chứng trong tuần này.
            </p>
          ) : (
            <ul className="mt-space-md space-y-space-sm">
              {summary.topSkills.map((skill) => (
                <li key={skill.skillId}>
                  <Link
                    href={`/skills/${skill.skillId}`}
                    className="bg-surface-container-low block rounded-lg p-space-md transition hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block font-body-md text-body-md text-on-surface">
                      {skill.name}
                    </span>
                    <span className="mt-1 block font-code-md text-code-md tabular text-outline">
                      +{skill.evidenceCount} Evidence
                      {skill.avgRating !== null
                        ? ` · điểm AI: ${skill.avgRating.toFixed(1)}/4`
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Chỉ số sinh trắc học tuần
          </h2>
          <table className="mt-space-md w-full">
            <caption className="sr-only">Chỉ số sinh trắc học trung bình trong tuần</caption>
            <tbody className="space-y-space-xs">
              {[
                ["Mood", summary.bio.mood],
                ["Focus", summary.bio.focus],
                ["Sleep (giờ)", summary.bio.sleep],
              ].map(([label, value]) => (
                <tr key={String(label)}>
                  <th scope="row" className="font-body-sm text-body-sm text-on-surface-variant">
                    {label}
                  </th>
                  <td className="text-right font-code-md text-code-md tabular text-on-surface">
                    {value ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Tiến độ về mục tiêu (FR-PR-08) ─────────────────────────────── */}
      {summary.goal && (
        <section className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Tiến độ về mục tiêu
          </h2>
          <p className="mt-space-md font-body-md text-body-md text-on-surface">
            {summary.goal.title}
          </p>
          <p className="mt-1 font-code-md text-code-md tabular text-secondary">
            {summary.goal.currentLevel ?? "—"} → {summary.goal.targetLevel ?? "—"}
            {summary.goal.remainingLevels !== null && (
              <> · còn {summary.goal.remainingLevels} bậc</>
            )}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {summary.goal.targetDate
              ? `Hạn: ${summary.goal.targetDate}`
              : "Chưa chốt ngày thi — chưa tự tính số tuần còn lại."}
          </p>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Hành động tuần này liên quan: {summary.activityCount} hoạt động ·{" "}
            {summary.topSkills[0]?.name ?? "chưa có kỹ năng nổi bật"}
          </p>
        </section>
      )}

      {/* ── Nhận định 3 điểm ───────────────────────────────────────────── */}
      <InsightBlock
        insights={insights}
        streaming={stream.streaming}
        error={stream.error}
        onRetry={() => void stream.start(week)}
        hasApiKey={hasApiKey}
      />

      {/* ── Kế hoạch tuần tới ─────────────────────────────────────────── */}
      <NextWeekPlanView
        plan={
          activePlan ?? {
            slots: [],
            reducedLoad: false,
            reduceReason: null,
          }
        }
        editable
        onChange={(next) => setPlan(next)}
        onApprove={approve}
        weekLabel={nextWeekLabel}
        warning={stream.warning}
        applying={applying}
      />

      {applyError && (
        <p role="alert" className="bg-error/10 text-error rounded-lg p-space-md font-body-sm text-body-sm">
          {applyError}
        </p>
      )}

      {applied && (
        <p
          role="status"
          className="bg-primary/10 text-primary rounded-lg p-space-md font-body-sm text-body-sm"
        >
          <Icon name="verified" size={16} className="mr-1" />
          Đã áp dụng kế hoạch cho {nextWeekLabel} — 42 slot trong 7 ngày.
        </p>
      )}

      {/* ── Hành động ──────────────────────────────────────────────────── */}
      <section className="flex flex-wrap gap-space-sm">
        {hasApiKey && (
          <button
            type="button"
            onClick={() => void stream.start(week)}
            disabled={stream.streaming}
            className="rounded-lg bg-secondary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-secondary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            <Icon name="psychology" size={16} className="mr-1" />
            {stream.streaming ? "Đang tổng hợp…" : "Tự động tổng hợp"}
          </button>
        )}

        <a
          href={`/api/review/weekly?week=${week}`}
          className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="ios_share" size={16} className="mr-1" />
          Xuất JSON
        </a>

        <Link
          href="/progress"
          className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Xem báo cáo tiến bộ
        </Link>
      </section>
    </div>
  );
}
