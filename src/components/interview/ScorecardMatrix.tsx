"use client";

import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { RUBRIC_TECHNICAL, RUBRIC_COMMUNICATION, type RubricCriterion } from "@/lib/rubrics";

interface ScorecardMatrixProps {
  /** Ma trận điểm: kind -> criterion -> {score, note} */
  matrix: Record<string, Record<string, { score: number; note?: string }>>;
  /** Delta so với phiên trước (cùng profile) */
  delta?: Record<string, number>;
  /** Tổng điểm trung bình */
  overallScore: number;
  /** Số câu hỏi đã hỏi */
  questionCount: number;
  /** Các kind đã xuất hiện */
  kindsPresent: string[];
  compact?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  concept: "Khái niệm",
  design: "Thiết kế",
  debug: "Debug",
  tradeoff: "Đánh đổi",
  behavioral: "Hành vi",
};

const CRITERION_KEYS_TECHNICAL = ["accuracy", "depth", "reasoning", "communication", "tradeoff"] as const;
const CRITERION_KEYS_COMMUNICATION = ["clarity", "structure", "tone", "natural", "grammar"] as const;

function getRubric(kind: string): readonly RubricCriterion[] {
  return kind === "behavioral" ? RUBRIC_COMMUNICATION : RUBRIC_TECHNICAL;
}

function getCriterionKeys(kind: string): readonly string[] {
  return kind === "behavioral" ? CRITERION_KEYS_COMMUNICATION : CRITERION_KEYS_TECHNICAL;
}

function getScoreColor(score: number): string {
  if (score >= 4) return "text-green-700 dark:text-green-300";
  if (score >= 3) return "text-yellow-700 dark:text-yellow-300";
  if (score >= 2) return "text-orange-700 dark:text-orange-300";
  return "text-red-700 dark:text-red-300";
}

function getScoreBg(score: number): string {
  if (score >= 4) return "bg-green-100 dark:bg-green-900/40";
  if (score >= 3) return "bg-yellow-100 dark:bg-yellow-900/40";
  if (score >= 2) return "bg-orange-100 dark:bg-orange-900/40";
  return "bg-red-100 dark:bg-red-900/40";
}

function formatDelta(delta: number | undefined): string {
  if (delta === undefined || delta === 0) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

function getDeltaColor(delta: number | undefined): string {
  if (delta === undefined || delta === 0) return "text-on-surface-variant";
  if (delta > 0) return "text-green-700 dark:text-green-300";
  return "text-red-700 dark:text-red-300";
}

export function ScorecardMatrix({
  matrix,
  delta,
  overallScore,
  questionCount,
  kindsPresent,
  compact = false,
}: ScorecardMatrixProps) {
  if (compact) {
    return (
      <Card className="space-y-space-sm">
        <div className="flex items-center justify-between">
          <h4 className="font-headline-sm text-on-surface">Scorecard {questionCount} câu</h4>
          <div className="flex items-center gap-space-sm">
            <span className="font-headline-lg font-mono" style={{ color: `var(--md-sys-color-${overallScore >= 3.5 ? "primary" : overallScore >= 2.5 ? "tertiary" : "error"})` }}>
              {overallScore.toFixed(1)}
            </span>
            <span className="text-body-sm text-on-surface-variant">/ 5.0</span>
          </div>
        </div>
        <div className="grid gap-space-sm sm:grid-cols-2">
          {kindsPresent.map((kind) => {
            const kindData = matrix[kind];
            if (!kindData) return null;
            const keys = getCriterionKeys(kind);
            const avg = keys.reduce((sum, k) => sum + (kindData[k]?.score || 0), 0) / keys.length;
            return (
              <div
                key={kind}
                className="p-space-sm rounded-xl bg-surface-container-highest/50"
              >
                <div className="font-label-md text-on-surface">{KIND_LABELS[kind] || kind}</div>
                <div className="flex items-center gap-space-sm mt-space-xs">
                  <span className="font-headline-sm font-mono" style={{ color: `var(--md-sys-color-${avg >= 3.5 ? "primary" : avg >= 2.5 ? "tertiary" : "error"})` }}>
                    {avg.toFixed(1)}
                  </span>
                  <span className="text-body-xs text-on-surface-variant">/5</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-gutter">
      <div className="flex items-start justify-between gap-gutter flex-wrap">
        <div>
          <h3 className="font-headline-md text-on-surface">Ma trận 5 tiêu chí × {kindsPresent.length} dạng câu</h3>
          <p className="text-body-sm text-on-surface-variant mt-space-xs">
            {questionCount} câu hỏi · Tổng điểm: <span className="font-mono font-medium text-on-surface">{overallScore.toFixed(1)}/5.0</span>
          </p>
        </div>
        {delta && (
          <div className="shrink-0 text-right">
            <div className="font-label-sm text-on-surface-variant">Delta vs phiên trước</div>
            <div className="font-headline-sm font-mono" style={{ color: `var(--md-sys-color-${(delta.overall || 0) >= 0 ? "primary" : "error"})` }}>
              {formatDelta(delta.overall)}
            </div>
          </div>
        )}
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="text-left p-space-sm font-label-md text-on-surface-variant w-32">Tiêu chí</th>
              {kindsPresent.map((kind) => (
                <th key={kind} className="text-center p-space-sm font-label-md text-on-surface-variant w-[80px]">
                  {KIND_LABELS[kind] || kind}
                </th>
              ))}
              <th className="text-center p-space-sm font-label-md text-on-surface-variant w-24">TB</th>
              {delta && (
                <th className="text-center p-space-sm font-label-md text-on-surface-variant w-20">Δ</th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Rows for each criterion */}
            {(() => {
              const allKeys = new Set<string>();
              kindsPresent.forEach((kind) => {
                getCriterionKeys(kind).forEach((k) => allKeys.add(k));
              });
              return Array.from(allKeys).map((criterionKey) => {
                const criterion = RUBRIC_TECHNICAL.find((c) => c.key === criterionKey) ||
                  RUBRIC_COMMUNICATION.find((c) => c.key === criterionKey);
                return (
                  <tr key={criterionKey} className="border-b border-outline-variant/50 hover:bg-surface-container-highest/30">
                    <td className="p-space-sm font-label-sm text-on-surface whitespace-nowrap">
                      {criterion?.name || criterionKey}
                    </td>
                    {kindsPresent.map((kind) => {
                      const kindData = matrix[kind];
                      const scoreData = kindData?.[criterionKey];
                      const score = scoreData?.score ?? 0;
                      const hasData = criterionKey in (kindData || {});
                      return (
                        <td key={kind} className="text-center p-space-sm">
                          {hasData ? (
                            <div
                              className={cn(
                                "w-16 h-8 mx-auto rounded-lg flex items-center justify-center font-mono font-medium transition-colors",
                                getScoreBg(score),
                                getScoreColor(score),
                              )}
                              title={scoreData?.note}
                            >
                              {score.toFixed(1)}
                            </div>
                          ) : (
                            <span className="text-on-surface-variant/50">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center p-space-sm font-mono font-medium text-on-surface">
                      {(() => {
                        const scores = kindsPresent
                          .map((k) => matrix[k]?.[criterionKey]?.score)
                          .filter((s): s is number => s !== undefined);
                        if (scores.length === 0) return "—";
                        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                        return avg.toFixed(1);
                      })()}
                    </td>
                    {delta && (
                      <td className="text-center p-space-sm font-mono" style={{ color: `var(--md-sys-color-${(delta[criterionKey] || 0) >= 0 ? "primary" : "error"})` }}>
                        {formatDelta(delta[criterionKey])}
                      </td>
                    )}
                  </tr>
                );
              });
            })()}

            {/* Overall row */}
            <tr className="bg-surface-container-highest/50 font-medium">
              <td className="p-space-sm font-label-md text-on-surface">TRUNG BÌNH</td>
              {kindsPresent.map((kind) => {
                const kindData = matrix[kind];
                const keys = getCriterionKeys(kind);
                const avg = keys.reduce((sum, k) => sum + (kindData?.[k]?.score || 0), 0) / keys.length;
                return (
                  <td key={kind} className="text-center p-space-sm font-mono" style={{ color: `var(--md-sys-color-${avg >= 3.5 ? "primary" : avg >= 2.5 ? "tertiary" : "error"})` }}>
                    {avg.toFixed(1)}
                  </td>
                );
              })}
              <td className="text-center p-space-sm font-headline-sm font-mono" style={{ color: `var(--md-sys-color-${overallScore >= 3.5 ? "primary" : overallScore >= 2.5 ? "tertiary" : "error"})` }}>
                {overallScore.toFixed(1)}
              </td>
              {delta && (
                <td className="text-center p-space-sm font-headline-sm font-mono" style={{ color: `var(--md-sys-color-${(delta.overall || 0) >= 0 ? "primary" : "error"})` }}>
                  {formatDelta(delta.overall)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-space-sm pt-gutter border-t border-outline-variant">
        <span className="font-label-sm text-on-surface-variant">Thang điểm:</span>
        <span className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs">4–5 Xuất sắc</span>
        <span className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 text-xs">3–4 Khá</span>
        <span className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs">2–3 Cần cải thiện</span>
        <span className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs">{"<2"} Yếu</span>
      </div>
    </Card>
  );
}