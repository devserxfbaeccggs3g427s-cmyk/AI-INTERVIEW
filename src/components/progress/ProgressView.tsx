"use client";

import { useState } from "react";
import { EvidenceHeatmap } from "@/components/charts/EvidenceHeatmap";
import { TimeAllocationChart } from "@/components/charts/TimeAllocationChart";
import { TrajectoryChart } from "@/components/charts/TrajectoryChart";
import { DomainFilter, type DomainFilterValue } from "@/components/progress/DomainFilter";
import { SelfCompareTable } from "@/components/progress/SelfCompareTable";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Chip, Stat } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toaster";
import { dateKey } from "@/lib/dates";
import { buildExportPayload } from "@/lib/progress-export";
import type { ProgressReport } from "@/lib/progress-types";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";

/**
 * `ProgressView` — view phía client của S14 `/progress` (tasks.md 16.1 → 16.7).
 *
 * Server Component (`src/app/progress/page.tsx`) đọc DB rồi đẩy `ProgressReport`
 * xuống đây. Mọi thao tác tương tác nằm ở client:
 *   - **16.6** — `DomainFilter` giữ state `activeDomain`; đổi domain lọc **cả**
 *     quỹ đạo, heatmap và phân bổ thời gian.
 *   - **16.7** — nút "Xuất JSON tiến độ" tải file JSON thật qua
 *     `Blob` + `URL.createObjectURL` + `<a download>`.
 *
 * **P7 — không vanity metric:** không có KPI "tổng giờ học" trần trụi. Thời gian
 * chỉ xuất hiện khi gắn với sản phẩm (`Evidence`), trong card phân bổ thời gian
 * và trong dòng tự đối sánh "Thời gian thực chiến có sản phẩm".
 *
 * Xem tasks.md 16.1–16.7 · requirements.md §2.12 (AC 12.1–12.11).
 */

/** Các nhóm KPI / biểu đồ có thể ẩn–hiện (AC 12.10). */
type SectionId = "kpi" | "domains" | "trajectory" | "heatmap" | "compare" | "allocation";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "kpi", label: "KPI tổng quan" },
  { id: "domains", label: "KPI theo domain" },
  { id: "trajectory", label: "Quỹ đạo 6 tháng" },
  { id: "heatmap", label: "Heatmap bằng chứng" },
  { id: "compare", label: "Tự đối sánh T-30" },
  { id: "allocation", label: "Thời gian thực chiến" },
];

/** Định dạng số thập phân, `null` → dấu gạch dài. */
function num(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

export function ProgressView({
  report,
  /** SHA-256 của báo cáo (AC 12.8) — tính ở server. */
  digest,
}: {
  /** Toàn bộ báo cáo đã tính ở server. */
  report: ProgressReport;
  /** Digest SHA-256 ngắn của báo cáo. */
  digest: string | null;
}) {
  const { toast } = useToast();
  const [activeDomain, setActiveDomain] = useState<DomainFilterValue>(null);
  const [hidden, setHidden] = useState<SectionId[]>([]);

  const { kpi, domains, trajectory, heatmap, heatmapCounts, comparison, allocation } = report;

  const isVisible = (id: SectionId) => !hidden.includes(id);
  const toggleSection = (id: SectionId) =>
    setHidden((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  // Các domain đang hiển thị sau bộ lọc.
  const visibleDomains = activeDomain
    ? domains.filter((d) => d.domain === activeDomain)
    : domains;

  // ── 16.7 — Xuất JSON tiến độ ───────────────────────────────────────────────
  const handleExport = () => {
    const payload = buildExportPayload(report, digest, visibleDomains);

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-loop-progress-${dateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      tone: "success",
      title: "Đã xuất JSON tiến độ",
      description: `Tệp ${link.download} gồm kpi, domains và self_comparison.`,
    });
  };

  const levelDeltaHint =
    kpi.averageLevelDelta === null
      ? "Chưa đủ dữ liệu để so sánh 30 ngày trước"
      : `${kpi.averageLevelDelta >= 0 ? "+" : "−"}${Math.abs(kpi.averageLevelDelta).toFixed(1)} so với 30 ngày trước`;

  const evidenceDelta = kpi.evidenceThisMonth - kpi.evidencePrevMonth;

  return (
    <div className="space-y-gutter-lg" data-testid="progress-view">
      {/* ── Thanh điều khiển: lọc domain + ẩn/hiện nhóm KPI ─────────────────── */}
      <div className="flex flex-col gap-space-md rounded-xl border border-outline-variant/30 bg-surface-container-low p-gutter xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-space-sm">
          <Label>Lọc theo domain</Label>
          <DomainFilter value={activeDomain} onChange={setActiveDomain} />
        </div>

        <div className="space-y-space-sm">
          <Label>Ẩn / hiện nhóm KPI</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ẩn hoặc hiện nhóm KPI">
            {SECTIONS.map((section) => {
              const shown = isVisible(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-pressed={shown}
                  data-testid={`section-toggle-${section.id}`}
                  className={
                    shown
                      ? "rounded px-2 py-1 font-label-md text-primary"
                      : "rounded bg-surface-container-high px-2 py-1 font-label-md text-outline line-through"
                  }
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0">
          <Button
            variant="secondary"
            size="md"
            icon="download"
            onClick={handleExport}
            data-testid="export-progress-json"
          >
            Xuất JSON tiến độ
          </Button>
        </div>
      </div>

      {/* ── 16.1 — 4 KPI ───────────────────────────────────────────────────── */}
      {isVisible("kpi") ? (
        <section aria-label="KPI tổng quan" data-testid="kpi-ribbon">
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-4">
            <Card tone="low">
              <Stat
                icon="account_tree"
                label="Cấp độ kỹ năng bình quân"
                value={
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-headline-lg text-headline-lg leading-none text-on-surface">
                      {num(kpi.averageLevel)}
                    </span>
                    <span className="font-label-md text-outline">/ 5</span>
                  </span>
                }
                hint={
                  <span
                    className={
                      kpi.averageLevelDelta === null
                        ? "text-on-surface-variant"
                        : kpi.averageLevelDelta >= 0
                          ? "text-primary"
                          : "text-error"
                    }
                  >
                    {levelDeltaHint}
                  </span>
                }
              />
              <div className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-label-sm text-outline">
                Chuẩn hoá trên {kpi.skillCount} skill · nguồn `Skill.level`
              </div>
            </Card>

            <Card tone="low">
              <Stat
                icon="verified"
                label="Bằng chứng tích lũy tháng"
                value={
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-headline-lg text-headline-lg leading-none text-primary">
                      {kpi.evidenceThisMonth}
                    </span>
                    <span className="font-label-md text-outline">evidence</span>
                  </span>
                }
                hint={
                  <span className="text-on-surface-variant">
                    {kpi.monthLabel} ·{" "}
                    {evidenceDelta === 0
                      ? "bằng tháng trước"
                      : `${evidenceDelta > 0 ? "+" : "−"}${Math.abs(evidenceDelta)} so với tháng trước`}
                  </span>
                }
              />
              <div className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-label-sm text-outline">
                Tiến độ = bằng chứng (P3) · tháng trước: {kpi.evidencePrevMonth}
              </div>
            </Card>

            <Card tone="low">
              <Stat
                icon="psychology"
                label="Tỷ lệ giữ FSRS"
                value={
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-headline-lg text-headline-lg leading-none text-tertiary">
                      {kpi.fsrsRetention === null ? "—" : `${Math.round(kpi.fsrsRetention * 100)}%`}
                    </span>
                  </span>
                }
                hint={
                  <span className="text-on-surface-variant">
                    {kpi.fsrsReviewCount > 0
                      ? `${kpi.fsrsReviewCount} review · rating ≥ 3 / tổng (${kpi.fsrsWindow})`
                      : "Chưa có review nào để đo"}
                  </span>
                }
              />
              <div className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-label-sm text-outline">
                Nguồn `Review` · không suy đoán khi chưa có dữ liệu
              </div>
            </Card>

            <Card tone="low">
              <Stat
                icon="record_voice_over"
                label="Điểm phản xạ giao tiếp"
                value={
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-headline-lg text-headline-lg leading-none text-secondary">
                      {num(kpi.communicationScore)}
                    </span>
                    <span className="font-label-md text-outline">/ 5</span>
                  </span>
                }
                hint={
                  <span className="text-on-surface-variant">
                    {kpi.communicationSampleCount > 0
                      ? `TB ${kpi.communicationSampleCount} hoạt động viết / nói / mock (${kpi.communicationWindow})`
                      : "Chưa có hoạt động viết / nói / mock interview được chấm điểm"}
                  </span>
                }
              />
              <div className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-label-sm text-outline">
                Nguồn `Activity.aiScore` · thang 0–5
              </div>
            </Card>
          </div>
        </section>
      ) : null}

      {/* ── AC 12.2 — 4 KPI theo domain ────────────────────────────────────── */}
      {isVisible("domains") ? (
        <Card tone="base">
          <CardHeader
            icon="account_tree"
            title="KPI theo domain"
            subtitle="Level hiện tại và nơi đo của từng nhóm kỹ năng."
          />
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-4">
            {visibleDomains.map((d) => (
              <div
                key={d.domain}
                className="rounded-lg border border-outline-variant/25 bg-surface-container-low p-space-md"
                data-testid={`domain-kpi-${d.domain}`}
              >
                <div className="flex items-center justify-between gap-space-sm">
                  <span className="font-label-md text-on-surface">{d.label}</span>
                  <Chip tone="outline">{d.skillCount} skill</Chip>
                </div>
                <div className="mt-space-sm flex items-baseline gap-1.5">
                  <span className="font-headline-md text-headline-md text-on-surface">
                    {num(d.level)}
                  </span>
                  <span className="font-label-sm text-outline">/ 5</span>
                </div>
                <dl className="mt-space-sm space-y-0.5 font-label-sm text-on-surface-variant">
                  <div className="flex justify-between gap-space-sm">
                    <dt>Bằng chứng</dt>
                    <dd className="font-code-md text-on-surface">{d.evidenceCount}</dd>
                  </div>
                  <div className="flex justify-between gap-space-sm">
                    <dt>Thực chiến có sản phẩm</dt>
                    <dd className="font-code-md text-on-surface">
                      {Math.round((d.practiceMinutes / 60) * 10) / 10} giờ
                    </dd>
                  </div>
                </dl>
                <div className="mt-space-sm border-t border-outline-variant/20 pt-space-sm font-label-sm text-outline">
                  Đo từ: {d.source}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── 16.2 — Quỹ đạo 6 tháng ─────────────────────────────────────────── */}
      {isVisible("trajectory") ? (
        <Card tone="base">
          <CardHeader
            icon="trending_up"
            title="Quỹ đạo tăng trưởng cây kỹ năng (6 tháng gần nhất)"
            subtitle="4 đường theo domain · trục Y cố định level 0–5 · level tái dựng từ Evidence rating ≥ 3."
          />
          <TrajectoryChart data={trajectory} activeDomain={activeDomain} />
        </Card>
      ) : null}

      {/* ── 16.3 — Heatmap 90 ngày ─────────────────────────────────────────── */}
      {isVisible("heatmap") ? (
        <Card tone="base">
          <CardHeader
            icon="calendar_month"
            title="Heatmap tích lũy bằng chứng (90 ngày gần nhất)"
            subtitle="Chỉ tô ô có sản phẩm thực tế · ngày thật của hệ thống, không dùng chu kỳ mẫu."
          />
          <EvidenceHeatmap
            data={heatmap}
            counts={heatmapCounts}
            activeDomain={activeDomain}
          />
        </Card>
      ) : null}

      {/* ── 16.4 — Tự đối sánh 30 ngày ─────────────────────────────────────── */}
      {isVisible("compare") ? (
        <Card tone="base">
          <CardHeader
            icon="compare_arrows"
            title="Hiện tại so với chính mình 30 ngày trước"
            subtitle="Mọi chỉ số tính từ DB · giá trị cũ gạch ngang."
          />
          <SelfCompareTable data={comparison} />
        </Card>
      ) : null}

      {/* ── 16.5 — Thời gian deliberate practice ────────────────────────────── */}
      {isVisible("allocation") ? (
        <Card tone="base">
          <CardHeader
            icon="schedule"
            title="Thời gian deliberate practice"
            subtitle="Không tính giờ mở app thụ động · chỉ tính hoạt động đã tạo ra sản phẩm (Evidence)."
          />
          <TimeAllocationChart data={allocation} activeDomain={activeDomain} />
        </Card>
      ) : null}

      {/* ── AC 12.8 — Digest + trạng thái lưu trữ ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container-low px-gutter py-space-sm">
        <span className="flex items-center gap-1.5 font-label-md text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
            fingerprint
          </span>
          SHA-256 báo cáo:{" "}
          <span className="font-code-md text-on-surface">{digest ?? "—"}</span>
        </span>
        <span className="font-label-md text-outline">
          Đã lưu trong SQLite · kỳ {report.period.from} → {report.period.to}
        </span>
      </div>
    </div>
  );
}
