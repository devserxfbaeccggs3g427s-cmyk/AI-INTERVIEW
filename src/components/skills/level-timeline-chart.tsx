import { cn } from "@/lib/cn";
import type { WeeklyLevelPoint } from "@/lib/skills";

/**
 * Biểu đồ level theo tuần (FR-SK-14).
 *
 * ⚠️ FR-SK-14 — **không vẽ chart rỗng khi thiếu dữ liệu**: nếu không có điểm
 * nào thì hiện thông báo thay vì khung rỗng.
 */
export interface LevelTimelineChartProps {
  points: WeeklyLevelPoint[];
  /** Level mục tiêu — vẽ đường ngưỡng. */
  targetLevel: number;
}

export function LevelTimelineChart({ points, targetLevel }: LevelTimelineChartProps) {
  if (points.length === 0) {
    return (
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Level theo tuần
        </h2>
        <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
          Chưa có bằng chứng nào để dựng biểu đồ level theo thời gian.
        </p>
      </section>
    );
  }

  const maxLevel = Math.max(targetLevel, ...points.map((p) => p.level), 1);
  const height = 96;

  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Level theo tuần
        </h2>
        <span className="font-label-sm text-label-sm text-outline">
          Ngưỡng mục tiêu: Cấp {targetLevel}
        </span>
      </div>

      <div className="mt-space-md flex items-end gap-2" style={{ height }}>
        {points.map((point) => {
          // Quy đổi level → chiều cao thanh (0..1 theo maxLevel).
          const ratio = point.level / maxLevel;

          return (
            <div key={point.week} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-code-md text-code-md text-on-surface-variant tabular">
                {point.level}
              </span>
              <div
                className="flex w-full flex-1 items-end"
                style={{ minHeight: "1.5rem" }}
              >
                <div
                  className={cn(
                    "w-full rounded-t-sm",
                    point.level >= targetLevel ? "bg-primary" : "bg-secondary",
                  )}
                  style={{ height: `${Math.max(6, ratio * height)}px` }}
                  title={`${point.week}: level ${point.level} (${point.strongEvidence} bằng chứng đạt chuẩn)`}
                />
              </div>
              <span className="font-label-sm text-label-sm text-outline">
                {point.week.replace(/^\d{4}-/, "")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
