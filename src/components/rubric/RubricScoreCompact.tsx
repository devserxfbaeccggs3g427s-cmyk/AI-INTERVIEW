"use client";

import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { RUBRIC_COMMUNICATION, RUBRIC_TECHNICAL, type RubricCriterion } from "@/lib/rubrics";

interface ScoreItem {
  criterion: string;
  score: number; // 0-5
  note?: string;
}

interface RubricScoreCompactProps {
  scores: Record<string, { score: number; note?: string }>;
  rubricType?: "communication" | "technical" | "behavioral";
  showNotes?: boolean;
  compact?: boolean;
  className?: string;
}

const RUBRIC_MAP: Record<"communication" | "technical" | "behavioral", readonly RubricCriterion[]> = {
  communication: RUBRIC_COMMUNICATION,
  technical: RUBRIC_TECHNICAL,
  behavioral: RUBRIC_COMMUNICATION, // fallback
};

const CRITERION_KEYS_COMMUNICATION = ["clarity", "structure", "tone", "natural", "grammar"] as const;
const CRITERION_KEYS_TECHNICAL = ["accuracy", "depth", "reasoning", "communication", "tradeoff"] as const;

function getScoreColor(score: number): string {
  if (score >= 4) return "text-green-600 dark:text-green-400";
  if (score >= 3) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 2) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 4) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 3) return "bg-yellow-100 dark:bg-yellow-900/30";
  if (score >= 2) return "bg-orange-100 dark:bg-orange-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function RubricScoreCompact({
  scores,
  rubricType = "technical",
  showNotes = false,
  compact = false,
  className,
}: RubricScoreCompactProps) {
  const rubric = RUBRIC_MAP[rubricType];
  const keys = rubricType === "technical" ? CRITERION_KEYS_TECHNICAL : CRITERION_KEYS_COMMUNICATION;

  const items = keys.map((key) => {
    const criterion = rubric.find((c) => c.key === key);
    const scoreData = scores[key];
    return {
      key,
      name: criterion?.name || key,
      desc: criterion?.desc || "",
      score: scoreData?.score ?? 0,
      note: scoreData?.note,
    };
  });

  const avgScore = items.reduce((sum, item) => sum + item.score, 0) / items.length;

  if (compact) {
    return (
      <div className={cn("flex flex-wrap gap-space-sm", className)} role="list" aria-label="Rubric scores compact">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn(
              "flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm",
              getScoreBg(item.score),
              getScoreColor(item.score),
            )}
            title={`${item.name}: ${item.score.toFixed(1)}/5${item.note ? ` — ${item.note}` : ""}`}
            role="listitem"
          >
            <span className="font-medium">{item.name}</span>
            <span className="font-mono">{item.score.toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className={cn("space-y-space-sm", className)}>
      <div className="flex items-center justify-between">
        <h4 className="font-headline-sm text-on-surface">Rubric 5 tiêu chí</h4>
        <div className="flex items-center gap-space-sm">
          <span className="font-headline-md font-mono" style={{ color: `var(--md-sys-color-${avgScore >= 3.5 ? "primary" : avgScore >= 2.5 ? "tertiary" : "error"})` }}>
            {avgScore.toFixed(1)}
          </span>
          <span className="text-body-sm text-on-surface-variant">/ 5.0</span>
        </div>
      </div>

      <div className="space-y-space-xs" role="list" aria-label="Chi tiết 5 tiêu chí">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-space-sm p-space-sm rounded-lg hover:bg-surface-container-highest/50 transition-colors"
            role="listitem"
          >
            <div className="w-24 shrink-0 font-label-sm text-on-surface-variant">{item.name}</div>
            <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(item.score / 5) * 100}%`,
                  backgroundColor: `var(--md-sys-color-${item.score >= 3.5 ? "primary" : item.score >= 2.5 ? "tertiary" : "error"})`,
                }}
              />
            </div>
            <div className={cn("w-12 shrink-0 text-right font-mono font-medium", getScoreColor(item.score))}>
              {item.score.toFixed(1)}
            </div>
          </div>
        ))}
      </div>

      {showNotes && (
        <details className="mt-gutter border-t border-outline-variant pt-gutter">
          <summary className="font-label-md text-on-surface-variant cursor-pointer select-none">
            Xem nhận xét chi tiết
          </summary>
          <div className="mt-space-sm space-y-space-sm text-body-sm text-on-surface-variant">
            {items.map((item) =>
              item.note ? (
                <div key={item.key} className="flex gap-space-sm">
                  <span className="font-medium text-on-surface min-w-[80px]">{item.name}:</span>
                  <span>{item.note}</span>
                </div>
              ) : null
            )}
          </div>
        </details>
      )}
    </Card>
  );
}

/** Component hiển thị điểm số đơn giản cho SessionProgress */
export function RubricScoreInline({
  scores,
  rubricType = "technical",
}: {
  scores: Record<string, { score: number; note?: string }>;
  rubricType?: "communication" | "technical" | "behavioral";
}) {
  const rubric = RUBRIC_MAP[rubricType];
  const keys = rubricType === "technical" ? CRITERION_KEYS_TECHNICAL : CRITERION_KEYS_COMMUNICATION;

  const items = keys.map((key) => {
    const criterion = rubric.find((c) => c.key === key);
    const scoreData = scores[key];
    return {
      name: criterion?.name || key,
      score: scoreData?.score ?? 0,
    };
  });

  const avgScore = items.reduce((sum, item) => sum + item.score, 0) / items.length;

  return (
    <div className="flex items-center gap-gutter">
      <div className="flex items-center gap-space-xs" aria-label={`Điểm trung bình: ${avgScore.toFixed(1)} trên 5`}>
        <span className="font-headline-md font-mono" style={{ color: `var(--md-sys-color-${avgScore >= 3.5 ? "primary" : avgScore >= 2.5 ? "tertiary" : "error"})` }}>
          {avgScore.toFixed(1)}
        </span>
        <span className="text-body-sm text-on-surface-variant">/5</span>
      </div>
      <div className="flex items-center gap-space-xs" role="img" aria-label={`${items.map(i => `${i.name} ${i.score.toFixed(1)}`).join(", ")}`}>
        {items.map((item) => (
          <div
            key={item.name}
            className={cn(
              "w-16 h-2 rounded bg-surface-container-highest overflow-hidden",
              getScoreBg(item.score),
            )}
            title={`${item.name}: ${item.score.toFixed(1)}`}
          >
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${(item.score / 5) * 100}%`,
                backgroundColor: `var(--md-sys-color-${item.score >= 3.5 ? "primary" : item.score >= 2.5 ? "tertiary" : "error"})`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}