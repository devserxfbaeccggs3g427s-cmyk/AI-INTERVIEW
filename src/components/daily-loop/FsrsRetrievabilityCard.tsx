"use client";

import { Badge, ProgressBar, Stat } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import type { FsrsStatsDTO } from "@/lib/daily-loop-types";

/**
 * `FsrsRetrievabilityCard` (task 4.7).
 *
 * Hiển thị: retention % (TB các thẻ đã học), stability TB, difficulty TB và
 * đường cong suy giảm 7 ngày.
 *
 * ⚠️ Sparkline vẽ bằng **SVG thuần** — không dùng recharts ở đây (recharts là
 * thư viện nặng, chỉ dành cho biểu đồ lớn ở S04/S13/S14). Màu đường dùng
 * token CSS (`var(--color-tertiary)`) để không hardcode hex (NFR-10).
 *
 * Xem design.md §4.1 · src/lib/fsrs.ts (`retrievabilityPercent`, `retentionCurve`).
 */
export function FsrsRetrievabilityCard({ stats }: { stats: FsrsStatsDTO }) {
  const hasData = stats.retention !== null;

  return (
    <Card className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-tertiary" aria-hidden>
            psychology
          </span>
          <h3 className="font-headline-md text-on-surface">Ghi nhớ &amp; ôn tập</h3>
        </div>
        <Badge tone={hasData ? "tertiary" : "outline"}>
          {hasData ? `${stats.learningCount}/${stats.totalCount} thẻ đã học` : "Chưa ôn thẻ nào"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-gutter">
        <Stat
          label="Retention"
          value={hasData ? `${stats.retention}%` : "—"}
          hint="khả năng nhớ hiện tại"
          icon="target"
        />
        <Stat
          label="Stability TB"
          value={stats.avgStability === null ? "—" : stats.avgStability}
          hint="độ bền nhớ (ngày)"
          icon="shield"
        />
        <Stat
          label="Difficulty TB"
          value={stats.avgDifficulty === null ? "—" : stats.avgDifficulty}
          hint="độ khó FSRS"
          icon="stairs"
        />
      </div>

      <div>
        <div className="mb-space-sm flex items-baseline justify-between">
          <span className="font-label-sm uppercase tracking-widest text-outline">
            Đường cong suy giảm 7 ngày
          </span>
          <span className="font-code-md text-tertiary">
            {hasData ? `${stats.retention}%` : "—"}
          </span>
        </div>
        {hasData && stats.curve.length > 0 ? (
          <Sparkline points={stats.curve} />
        ) : (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-outline-variant/40 text-body-sm text-outline">
            Chưa có dữ liệu suy giảm — hãy ôn ít nhất 1 thẻ.
          </div>
        )}
      </div>

      {hasData ? (
        <div>
          <div className="mb-space-sm font-label-sm uppercase tracking-widest text-outline">
            Mức giữ nhớ
          </div>
          <ProgressBar value={stats.retention ?? 0} tone="tertiary" />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Sparkline SVG thuần.
 *
 * `points` là mảng retention 0..1 (7 điểm). Vẽ đường + vùng tô nhạt.
 * Dùng `currentColor`/token CSS nên không có màu hex hardcode.
 */
function Sparkline({ points }: { points: number[] }) {
  const width = 320;
  const height = 80;
  const pad = 4;

  const max = Math.max(...points, 0.0001);
  const min = Math.min(...points, 0);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
    const y = height - pad - ((p - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1]?.x.toFixed(1) ?? width - pad},${height - pad} L${pad},${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-20 w-full"
      role="img"
      aria-label={`Đường cong suy giảm 7 ngày: ${points.map((p) => Math.round(p * 100)).join("%, ")}%`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="fsrs-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-tertiary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-tertiary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#fsrs-area)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-tertiary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="var(--color-tertiary)" />
      ))}
    </svg>
  );
}
