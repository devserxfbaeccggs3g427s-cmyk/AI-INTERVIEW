import type { FocusSkill } from "@/lib/daily-loop";

/**
 * Metrics row — 4 metric tile (task §20).
 *
 * ⚠️ NFR-DL-09 / P7 — **không vanity metric**: mỗi số liệu phải gắn với một
 * kỹ năng/hoạt động cụ thể và đo được từ DB. Vì vậy "Trạng thái AI Engine"
 * là ngoại lệ duy nhất — nó phản ánh trạng thái hệ thống, không phải tiến bộ.
 */
export interface MetricsRowProps {
  focus: FocusSkill | null;
  /** true = không có API key (offline mode). */
  isOffline: boolean;
}

export interface MetricSpec {
  label: string;
  value: string;
  tone: "primary" | "secondary" | "tertiary";
}

export function MetricsRow({ focus, isOffline }: MetricsRowProps) {
  const tiles: MetricSpec[] = focus
    ? [
        {
          label: "Cột mốc hiện tại",
          value: `${focus.skill.level}/${focus.skill.targetLevel}`,
          tone: "primary",
        },
        {
          label: "Bằng chứng xác thực",
          value: String(focus.strongEvidenceCount),
          tone: "primary",
        },
        {
          label: "Thời gian tích lũy",
          value: `${focus.minutesAccumulated}′`,
          tone: "secondary",
        },
        {
          label: "Trạng thái AI Engine",
          value: isOffline ? "Offline" : "Sẵn sàng",
          tone: isOffline ? "tertiary" : "secondary",
        },
      ]
    : [];

  if (tiles.length === 0) return null;

  return (
    <div className="mt-space-lg grid grid-cols-2 gap-gutter-md lg:grid-cols-4">
      {tiles.map((tile) => (
        <MetricTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}

function MetricTile({ label, value, tone }: MetricSpec) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "secondary"
        ? "text-secondary"
        : "text-tertiary";

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-container p-space-sm">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </span>
      <span className={`font-headline-sm text-headline-sm tabular ${toneClass}`}>{value}</span>
    </div>
  );
}
