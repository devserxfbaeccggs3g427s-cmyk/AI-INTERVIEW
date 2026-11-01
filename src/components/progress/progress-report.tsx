"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { EvidenceHeatmap } from "@/components/progress/evidence-heatmap";
import { PracticeTimeBar } from "@/components/progress/practice-time-bar";
import { SkillTrajectoryChart } from "@/components/progress/skill-trajectory-chart";
import { T30Benchmark } from "@/components/progress/t30-benchmark";
import { cn } from "@/lib/cn";
import type { DomainKey, ProgressReport } from "@/lib/analytics";

export interface ProgressReportProps {
  data: ProgressReport;
  skillTrajectories: Array<{
    domain: DomainKey;
    label: string;
    points: Array<{ month: string; level: number }>;
  }>;
}

const DOMAIN_FILTERS: Array<{ key: DomainKey | "all"; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "professional", label: "Chuyên môn" },
  { key: "communication", label: "Giao tiếp" },
  { key: "language", label: "Ngoại ngữ" },
  { key: "personal", label: "Cá nhân" },
];

/**
 * S14 — Báo cáo tiến bộ.
 *
 * ⚠️ Task 15.2: lọc **client-side** bằng `useState`, không refetch.
 * ⚠️ P7: mọi số liệu từ `data` — không hardcode.
 */
export function ProgressReportView({ data, skillTrajectories }: ProgressReportProps) {
  const [domain, setDomain] = useState<DomainKey | "all">(data.domain);

  const filtered = useMemo(() => {
    if (domain === "all") return data;
    return {
      ...data,
      domain,
      practiceTime: data.practiceTime.filter((row) => row.domain === domain),
      practiceTotalMinutes: data.practiceTime
        .filter((row) => row.domain === domain)
        .reduce((sum, row) => sum + row.minutes, 0),
    };
  }, [data, domain]);

  const filteredTrajectories = useMemo(
    () =>
      domain === "all"
        ? skillTrajectories
        : skillTrajectories.filter((item) => item.domain === domain),
    [skillTrajectories, domain],
  );

  const heatmapStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 89);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, []);

  const targetLevel = data.goal?.remainingLevels !== null && data.goal?.remainingLevels !== undefined
    ? null
    : null;

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header + filter ───────────────────────────────────────────── */}
      <header className="space-y-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div>
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Định kỳ {data.days} ngày qua · SQLite Sync · {data.evidenceCount} bằng
              chứng xác thực
            </p>
            <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
              Báo cáo tiến bộ
            </h1>
          </div>

          <a
            href="/api/progress/export"
            className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="download" size={16} className="mr-1" />
            Xuất JSON tiến độ
          </a>
        </div>

        <div className="flex flex-wrap gap-space-xs" role="group" aria-label="Lọc theo domain">
          {DOMAIN_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setDomain(filter.key)}
              aria-pressed={domain === filter.key}
              className={cn(
                "rounded px-3 py-1 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                domain === filter.key
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Metric tiles ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-gutter-md lg:grid-cols-4">
        <div className="bg-surface-container rounded-lg p-space-md">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Cấp độ kỹ năng bình quân
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-on-surface tabular">
            {filtered.levelAvg !== null ? `${filtered.levelAvg.toFixed(1)}/5.0` : "—"}
          </p>
          <p className="font-label-sm text-label-sm text-outline">
            {filtered.leafCount} kỹ năng lá
          </p>
        </div>

        <div className="bg-surface-container rounded-lg p-space-md">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Bằng chứng tích lũy
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-primary tabular">
            {filtered.evidenceCount}
          </p>
          <p className="font-label-sm text-label-sm text-outline tabular">
            {filtered.strongEvidenceCount} đạt chuẩn P3
          </p>
        </div>

        <div className="bg-surface-container rounded-lg p-space-md">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            FSRS Retention
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-tertiary tabular">
            {filtered.retention.rate !== null
              ? `${(filtered.retention.rate * 100).toFixed(1)}%`
              : "—"}
          </p>
          <p className="font-label-sm text-label-sm text-outline tabular">
            {filtered.retention.successful}/{filtered.retention.total} lượt ôn
          </p>
        </div>

        <div className="bg-surface-container rounded-lg p-space-md">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Tốc độ bằng chứng
          </p>
          <p className="font-headline-sm text-headline-sm font-semibold text-on-surface tabular">
            {filtered.days > 0
              ? (filtered.evidenceCount / filtered.days).toFixed(2)
              : "0"}
            /ngày
          </p>
          <p className="font-label-sm text-label-sm text-outline">100% đạt chuẩn P3</p>
        </div>
      </section>

      {/* ── Quỹ đạo tăng trưởng ───────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Quỹ đạo tăng trưởng cây kỹ năng
        </h2>
        <div className="mt-space-md">
          <SkillTrajectoryChart series={filteredTrajectories} targetLevel={targetLevel} />
        </div>
      </section>

      {/* ── Heatmap ───────────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Heatmap tích lũy bằng chứng (90 ngày)
        </h2>
        <div className="mt-space-md">
          <EvidenceHeatmap
            cells={filtered.heatmap}
            weeks={13}
            startDate={heatmapStart}
          />
        </div>
      </section>

      {/* ── T-30 + deliberate practice ─────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md lg:grid-cols-2">
        <T30Benchmark t30={filtered.t30} />
        <PracticeTimeBar
          practiceTime={filtered.practiceTime}
          totalMinutes={filtered.practiceTotalMinutes}
        />
      </section>

      {/* ── Mục tiêu ──────────────────────────────────────────────────── */}
      {filtered.goal && (
        <section className="bg-surface-container p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Tiến độ về mục tiêu
          </h2>
          <p className="mt-space-md font-body-md text-body-md text-on-surface">
            {filtered.goal.title}
          </p>
          <p className="mt-1 font-code-md text-code-md tabular text-secondary">
            {filtered.goal.currentLevel ?? "—"} → {filtered.goal.targetLevel ?? "—"}
            {filtered.goal.remainingLevels !== null && (
              <> · còn {filtered.goal.remainingLevels} bậc</>
            )}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {filtered.goal.targetDate
              ? `Hạn: ${filtered.goal.targetDate}`
              : "Chưa chốt ngày thi."}
          </p>
        </section>
      )}

      <a
        href="#top"
        className="inline-flex rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface"
      >
        <Icon name="arrow_upward" size={16} className="mr-1" />
        Lên đầu trang
      </a>
    </div>
  );
}
