"use client";

/**
 * WeeklyReportClient — bộ phận render nội dung S13 (15.1, 15.4, 15.5).
 *
 * Nhận payload đã fetch ở server, render:
 *   - KPI row (completion rate, streak, energy, FSRS retention)
 *   - Phân bổ 4 domain (4 bars)
 *   - Top 3 kỹ năng
 *   - Sinh trắc học (mood / sleep / energy TB)
 *   - InsightList (3 nhận định)
 *   - PlanProposal (6 slot + "Duyệt & Áp dụng")
 *
 * Xem design.md §4.13 · tasks.md 15.1–15.7.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Stat } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toaster";
import { DOMAIN_LABELS, type AiCallMeta, type Domain, type PlanSlot } from "@/lib/types";
import { InsightList, type Insight } from "@/components/review/InsightList";
import { PlanProposal } from "@/components/review/PlanProposal";

import type { ReviewPayload } from "../page";

export type { PlanSlot };

/** Dữ liệu kết quả gọi AI-07 (insights + slots). */
type AiResult = {
  insights: Insight[];
  slots: PlanSlot[];
  meta: AiCallMeta;
};

/** State của WeeklyReportClient. */
type ReportState = {
  aiResult: AiResult | null;
  loading: boolean;
  error: string | null;
  skills: Array<{ id: string; name: string; domain: Domain }>;
};

export function WeeklyReportClient({ payload }: { payload: ReviewPayload }) {
  const { toast } = useToast();
  const [state, setState] = useState<ReportState>({
    aiResult: null,
    loading: false,
    error: null,
    skills: [],
  });

  const { summary, previous, runState, reliefNote, slotCount } = payload;

  // Fetch skills khi component mount — dùng cho PlanProposal.
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch("/api/plan");
        const data = await res.json();
        if (data.ok && data.data?.skills) {
          setState((prev) => ({
            ...prev,
            skills: data.data.skills.map((s: { id: string; name: string; domain: string }) => ({
              id: s.id,
              name: s.name,
              domain: s.domain as Domain,
            })),
          }));
        }
      } catch {
        // Không báo lỗi — skills là optional cho PlanProposal.
      }
    };
    fetchSkills();
  }, []);

  // Task 15.2: tự động chạy Weekly Review nếu cờ cho phép.
  // Đã được kiểm tra ở server, nhưng client cũng cập nhật state nếu server chưa chạy.
  const handleRunWeeklyReview = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/review/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          previous,
          reliefNote,
          slotCount,
          weekKey: summary.weekKey,
        }),
      });
      const data = await res.json() as
        | { ok: true; data: { insights: Insight[]; slots: PlanSlot[] }; meta: AiCallMeta }
        | { ok: false; error: { code: string; message: string } };

      if (!data.ok) {
        setState((prev) => ({ ...prev, error: data.error.message, loading: false }));
        toast({
          tone: "error",
          title: "Weekly Review thất bại",
          description: data.error.message,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        aiResult: { insights: data.data.insights, slots: data.data.slots, meta: data.meta },
        loading: false,
      }));
      toast({
        tone: "success",
        title: "Weekly Review hoàn tất",
        description: `${data.data.insights.length} nhận định · ${data.data.slots.length} slot`,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: "Không kết nối được máy chủ" }));
      toast({ tone: "error", title: "Lỗi mạng", description: "Thử lại sau." });
    }
  }, [summary, previous, reliefNote, slotCount, toast]);

  // Auto-run nếu chưa từng chạy và là thời điểm chạy tự động.
  useEffect(() => {
    if (!runState.exists && !state.aiResult && !state.loading && !state.error) {
      void handleRunWeeklyReview();
    }
    // Chỉ chạy 1 lần khi mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers for rendering
  const completionPercent = (summary.completionRate * 100).toFixed(1);
  const prevCompletion = previous
    ? (previous.completionRate * 100).toFixed(1)
    : null;
  const deltaCompletion = previous
    ? ((summary.completionRate - previous.completionRate) * 100).toFixed(1)
    : null;

  const domainEntries = (Object.entries(summary.domainCounts) as [Domain, number][]).filter(
    ([d]) => summary.domainMinutes[d] > 0 || summary.domainCounts[d] > 0,
  );

  const hasDomainData = domainEntries.length > 0;

  return (
    <div className="space-y-gutter-lg">
      {/* ── KPI row (design.md §4.13) ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <Card tone="base">
          <Stat
            label="Tỷ lệ hoàn thành"
            value={
              <span className="text-on-surface">
                {summary.planDone}/{summary.planTotal} ({completionPercent}%)
              </span>
            }
            hint={
              prevCompletion !== null && deltaCompletion !== null
                ? `${Number(deltaCompletion) >= 0 ? "+" : ""}${deltaCompletion}% vs tuần trước`
                : undefined
            }
            icon="task_alt"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Chuỗi Kỷ Luật"
            value={<span className="text-primary">{summary.activityCount} hoạt động</span>}
            hint={`${summary.totalMinutes} phút hôm nay`}
            icon="streak"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Năng lượng TB"
            value={
              summary.avgEnergy !== null ? (
                <span className="text-on-surface">{summary.avgEnergy.toFixed(1)}/5</span>
              ) : (
                <span className="text-on-surface-variant">Chưa có dữ liệu</span>
              )
            }
            icon="energy_saver"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="SRS Retention"
            value={<span className="text-on-surface">{summary.srsReviews} lượt</span>}
            hint={`${summary.dueCards} thẻ đến hạn`}
            icon="psychology"
          />
        </Card>
      </div>

      {/* ── Phân bổ 4 domain ───────────────────────────────────────────────── */}
      <Card tone="base">
        <CardHeader
          title="Phân bổ 4 Trục Thực Thi"
          subtitle="Hoạt động & thời gian theo domain trong tuần"
          icon="donut_chart"
        />
        <div className="p-gutter space-y-space-md">
          {hasDomainData ? (
            (Object.entries(summary.domainCounts) as [Domain, number][]).map(([domain, count]) => (
              <DomainRow
                key={domain}
                domain={domain}
                count={count}
                minutes={summary.domainMinutes[domain] ?? 0}
              />
            ))
          ) : (
            <p className="text-center text-body-sm text-on-surface-variant py-gutter">
              Chưa có hoạt động trong tuần.
            </p>
          )}
        </div>
      </Card>

      {/* ── Top 3 kỹ năng ───────────────────────────────────────────────────── */}
      <Card tone="base">
        <CardHeader title="Top 3 Kỹ năng Bứt Phá" icon="star" />
        <div className="p-gutter">
          {summary.topSkills.length > 0 ? (
            <div className="grid gap-space-md sm:grid-cols-3">
              {summary.topSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          ) : (
            <p className="text-center text-body-sm text-on-surface-variant">
              Chưa có kỹ năng nổi bật.
            </p>
          )}
        </div>
      </Card>

      {/* ── Sinh trắc học ─────────────────────────────────────────────────── */}
      <Card tone="base">
        <CardHeader title="Chỉ Số Sinh Trắc Học Tuần" icon="health_activity" />
        <div className="p-gutter">
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
            <Stat
              label="Mood TB"
              value={
                summary.avgMood !== null ? (
                  <span className="text-on-surface">{summary.avgMood.toFixed(1)}/5</span>
                ) : (
                  <span className="text-on-surface-variant">Chưa có dữ liệu</span>
                )
              }
              hint={`${summary.stateDays} ngày có dữ liệu`}
            />
            <Stat
              label="Sleep TB"
              value={
                summary.avgSleep !== null ? (
                  <span className="text-on-surface">{summary.avgSleep.toFixed(1)}h</span>
                ) : (
                  <span className="text-on-surface-variant">Chưa có dữ liệu</span>
                )
              }
            />
            <Stat
              label="Energy TB"
              value={
                summary.avgEnergy !== null ? (
                  <span className="text-on-surface">{summary.avgEnergy.toFixed(1)}/5</span>
                ) : (
                  <span className="text-on-surface-variant">Chưa có dữ liệu</span>
                )
              }
            />
          </div>
        </div>
      </Card>

      {/* ── 3 nhận định (15.4) ─────────────────────────────────────────────── */}
      <Card tone="base">
        <CardHeader
          title="3 Nhận Định Tuần"
          subtitle={
            <div className="flex items-center gap-space-sm">
              <Chip tone="neutral" icon="auto_awesome">
                AI-07
              </Chip>
              {!state.aiResult && !runState.exists ? (
                <Button
                  variant="ai"
                  size="sm"
                  icon="auto_awesome"
                  onClick={handleRunWeeklyReview}
                  loading={state.loading}
                  data-testid="run-weekly-review"
                >
                  Chạy Weekly Review
                </Button>
              ) : null}
            </div>
          }
          icon="psychology"
        />
        <div className="p-gutter">
          {state.loading && !state.aiResult ? (
            <p className="text-body-sm text-on-surface-variant">Đang phân tích...</p>
          ) : state.aiResult ? (
            <InsightList insights={state.aiResult.insights} />
          ) : state.error ? (
            <p className="text-body-sm text-error">{state.error}</p>
          ) : runState.exists ? (
            <InsightList insights={[]} empty="Chưa có nhận định." />
          ) : (
            <InsightList
              insights={[]}
              empty="Nhấn 'Chạy Weekly Review' để sinh nhận định từ AI."
            />
          )}
        </div>
      </Card>

      {/* ── PlanProposal (15.5) ─────────────────────────────────────────────── */}
      {state.aiResult ? (
        <PlanProposal
          initialSlots={state.aiResult.slots}
          reliefNote={reliefNote}
          skills={state.skills}
        />
      ) : runState.exists && runState.applied ? (
        <Card tone="base">
          <CardHeader title="Kế hoạch tuần sau" icon="calendar_today" />
          <div className="p-gutter">
            <p className="text-body-sm text-on-surface-variant">
              Kế hoạch đã được áp dụng. Chuyển đến S02 để xem chi tiết.
            </p>
          </div>
        </Card>
      ) : (
        <Card tone="low">
          <CardHeader
            title="Đề xuất kế hoạch tuần sau"
            subtitle="Chạy Weekly Review để nhận đề xuất slot từ AI"
            icon="calendar_today"
          />
          <div className="p-gutter">
            <Button
              variant="ai"
              icon="auto_awesome"
              onClick={handleRunWeeklyReview}
              loading={state.loading}
              data-testid="generate-weekly-plan"
            >
              Sinh đề xuất từ AI
            </Button>
          </div>
        </Card>
      )}

      {/* ── Navigation (15.8) ─────────────────────────────────────────────── */}
      <Card tone="base">
        <CardHeader title="Điều hướng nhanh" icon="open_in_full" />
        <div className="p-gutter">
          <div className="flex flex-wrap gap-gutter">
            {/* 15.8: mockup trỏ s17 → /interview/setup đúng chuẩn nav */}
            <Button
              variant="secondary"
              icon="forum"
              onClick={() => {
                window.location.href = "/interview/setup";
              }}
              data-testid="nav-mock-interview"
            >
              Mock Interview
            </Button>
            {/* 15.8: mockup trỏ s21 → /test đúng chuẩn nav */}
            <Button
              variant="secondary"
              icon="assignment"
              onClick={() => {
                window.location.href = "/test";
              }}
              data-testid="nav-test"
            >
              Bài kiểm tra
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<Domain, "primary" | "secondary" | "tertiary" | "outline"> = {
  professional: "primary",
  communication: "secondary",
  language: "tertiary",
  personal: "outline",
};

/** Thanh tiến trình domain với label và thời gians. */
function DomainRow({
  domain,
  count,
  minutes,
}: {
  domain: Domain;
  count: number;
  minutes: number;
}) {
  const tone = DOMAIN_COLORS[domain];
  const pct = minutes > 0 ? Math.min(100, (minutes / 300) * 100) : 0; // chuẩn hóa max 300 phút/tuần

  return (
    <div className="space-y-space-xs">
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <Chip tone={tone}>{DOMAIN_LABELS[domain]}</Chip>
          <span className="font-code-md text-label-sm text-on-surface-variant">
            {count} hành động
          </span>
        </div>
        <span className="font-code-md text-label-md text-on-surface">{minutes} phút</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-[9999px] bg-surface-container-highest">
        <div
          className={`h-full rounded-[9999px] bg-${tone === "primary" ? "primary" : tone === "secondary" ? "secondary" : tone === "tertiary" ? "tertiary" : "outline"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Thẻ skill top 3. */
function SkillCard({
  skill,
}: {
  skill: { id: string; name: string; count: number; minutes: number };
}) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter">
      <div className="flex items-center gap-space-sm">
        <span className="font-headline-sm text-primary">{skill.name}</span>
        <Chip tone="neutral">{skill.count} lần</Chip>
      </div>
      <p className="mt-space-xs font-code-md text-label-sm text-on-surface-variant">
        {skill.minutes} phút
      </p>
    </div>
  );
}
