import type {
  DomainProgress,
  ProgressExportPayload,
  ProgressReport,
} from "@/lib/progress-types";

/**
 * Dựng payload JSON xuất ra cho nút "Xuất JSON tiến độ" (task 16.7).
 *
 * Tách ra module riêng (không `server-only`) để:
 *   - `ProgressView` (Client Component) gọi được.
 *   - Test được kiểm tra **cấu trúc** file JSON mà không cần bấm chuột.
 *
 * Payload bắt buộc có 3 khối: `kpi`, `domains`, `self_comparison` (Done 16.7).
 *
 * Xem tasks.md 16.7 · requirements.md AC 12.9.
 */

/** Làm tròn 2 chữ số — tránh float noise trong JSON. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * @param report     Báo cáo đã tính ở server.
 * @param digest     SHA-256 ngắn của báo cáo (AC 12.8).
 * @param domains    Danh sách domain sau khi áp bộ lọc (task 16.6).
 * @param generatedAt Thời điểm xuất — mặc định `new Date()`.
 */
export function buildExportPayload(
  report: ProgressReport,
  digest: string | null,
  domains: DomainProgress[],
  generatedAt: Date = new Date(),
): ProgressExportPayload {
  const { kpi, comparison } = report;

  return {
    spec: "Daily Loop OS v1.1 - S14",
    generated_at: generatedAt.toISOString(),
    period: report.period,
    digest,
    kpi: {
      average_skill_level: kpi.averageLevel,
      average_skill_level_delta_30d: kpi.averageLevelDelta,
      skill_count: kpi.skillCount,
      evidence_this_month: kpi.evidenceThisMonth,
      evidence_prev_month: kpi.evidencePrevMonth,
      fsrs_retention_rate: kpi.fsrsRetention,
      fsrs_review_count: kpi.fsrsReviewCount,
      communication_reflex_score: kpi.communicationScore,
      communication_sample_count: kpi.communicationSampleCount,
      practice_hours_with_evidence: kpi.practiceHours,
    },
    domains: domains.map((d) => ({
      domain: d.domain,
      label: d.label,
      level: d.level,
      skill_count: d.skillCount,
      evidence_count: d.evidenceCount,
      practice_hours: round2(d.practiceMinutes / 60),
      practice_share: d.share,
      source: d.source,
    })),
    self_comparison: {
      period: comparison.periodLabel,
      metrics: comparison.rows.map((row) => ({
        key: row.key,
        label: row.label,
        unit: row.unit,
        previous: row.previous,
        current: row.current,
        delta:
          row.previous === null || row.current === null
            ? null
            : round2(row.current - row.previous),
      })),
    },
  };
}
