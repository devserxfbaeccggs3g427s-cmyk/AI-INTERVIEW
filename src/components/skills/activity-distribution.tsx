import { cn } from "@/lib/cn";
import type { ActivityDistribution } from "@/lib/skills";

/**
 * Phân bổ hoạt động theo loại (FR-SK-15).
 *
 * ⚠️ P7 — chỉ tính loại **có bằng chứng** (dữ liệu đã lọc ở server).
 */
export interface ActivityDistributionProps {
  items: ActivityDistribution[];
}

const TYPE_LABELS: Record<string, string> = {
  study: "Học kỹ năng",
  deep_work: "Deep work",
  speak_write: "Luyện giao tiếp",
  srs: "Ôn SRS",
  language: "Luyện ngoại ngữ",
  journal: "Nhật ký",
  health: "Thể chất",
};

export function ActivityDistribution({ items }: ActivityDistributionProps) {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg">
      <h2 className="font-headline-md text-headline-md text-on-surface">
        Phân bổ hoạt động
      </h2>

      {items.length === 0 ? (
        <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
          Chưa có hoạt động nào có bằng chứng cho kỹ năng này.
        </p>
      ) : (
        <ul className="mt-space-md flex flex-col gap-space-sm">
          {items.map((item) => (
            <li key={item.type}>
              <div className="flex items-baseline justify-between gap-space-sm">
                <span className="text-body-sm text-body-sm text-on-surface">
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
                <span className="font-code-md text-code-md text-on-surface-variant tabular">
                  {item.count} bằng chứng · TB {item.averageRating}
                </span>
              </div>

              <div className="mt-space-xs h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div
                  className={cn("h-full rounded-full bg-secondary")}
                  style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
