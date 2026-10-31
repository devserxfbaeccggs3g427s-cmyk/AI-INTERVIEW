import { cn } from "@/lib/cn";
import { SKILL_LEVEL_MAX } from "@/lib/config";

/**
 * Thang level 0–5 (FR-SK-06).
 *
 * ⚠️ P7 — **không** hiển thị phần trăm mơ hồ ("hoàn thành 73%"). Chỉ hiển thị
 * thang 0–5 + số bằng chứng.
 */
export interface LevelScaleProps {
  /** Level hiện tại (0..5). */
  level: number;
  /** Level mục tiêu (1..5). */
  targetLevel: number;
  /** Tổng số bằng chứng. */
  evidenceCount: number;
  /** Số bằng chứng đạt chuẩn (rating ≥ 3). */
  strongEvidenceCount: number;
  /** Thu gọn (dùng cho node tầng 3 trong cây). */
  compact?: boolean;
  className?: string;
}

export function LevelScale({
  level,
  targetLevel,
  evidenceCount,
  strongEvidenceCount,
  compact = false,
  className,
}: LevelScaleProps) {
  const clamped = Math.max(0, Math.min(SKILL_LEVEL_MAX, level));

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="meter"
        aria-label={`Cấp ${clamped} trên ${SKILL_LEVEL_MAX}`}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={SKILL_LEVEL_MAX}
        aria-valuetext={`Cấp ${clamped} trên ${SKILL_LEVEL_MAX}`}
        className="flex items-center gap-0.5"
      >
        {Array.from({ length: SKILL_LEVEL_MAX }, (_, index) => {
          const filled = index < clamped;
          const isTarget = index < targetLevel;

          return (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                "h-1.5 w-full rounded-sm",
                filled
                  ? "bg-primary"
                  : isTarget
                    ? "bg-surface-variant"
                    : "bg-surface-container-highest",
              )}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-code-md text-code-md text-on-surface tabular">
          {clamped}/{SKILL_LEVEL_MAX}
        </span>

        {!compact && (
          <span className="font-label-sm text-label-sm text-outline">
            {evidenceCount} bằng chứng · {strongEvidenceCount} đạt
          </span>
        )}
      </div>
    </div>
  );
}
