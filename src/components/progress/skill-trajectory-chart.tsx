"use client";

export interface SkillTrajectoryChartProps {
  series: Array<{
    domain: string;
    label: string;
    points: Array<{ month: string; level: number }>;
  }>;
  /** Đường ngang đích (target line) — Q8. */
  targetLevel: number | null;
}

/** Màu đường theo domain — token design §7.5. */
const STROKE_BY_DOMAIN: Record<string, string> = {
  professional: "var(--color-secondary)",
  communication: "var(--color-tertiary)",
  language: "var(--color-primary)",
  personal: "var(--color-on-surface-variant)",
};

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 32;

/**
 * Line chart thang kỹ năng 6 tháng (FR-PR-01).
 *
 * ⚠️ Task 16.4: < 2 điểm dữ liệu ⇒ render dạng list thay vì chart rỗng.
 * ⚠️ Task 16.5: `aria-label` mô tả nội dung chart.
 */
export function SkillTrajectoryChart({ series, targetLevel }: SkillTrajectoryChartProps) {
  const withData = series.filter((item) => item.points.length >= 2);

  if (withData.length === 0) {
    return (
      <div className="space-y-space-xs">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Chưa đủ dữ liệu để vẽ quỹ đạo — cần ít nhất 2 tháng bằng chứng.
        </p>
        <ul className="space-y-space-xs">
          {series.map((item) => (
            <li
              key={item.domain}
              className="flex items-center justify-between font-body-sm text-body-sm"
            >
              <span className="text-on-surface-variant">{item.label}</span>
              <span className="font-code-md text-code-md tabular text-on-surface">
                {item.points.length > 0
                  ? item.points[item.points.length - 1].level.toFixed(1)
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const monthCount = Math.max(...withData.map((item) => item.points.length));
  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;

  const xAt = (index: number) =>
    PADDING + (monthCount <= 1 ? 0 : (index / (monthCount - 1)) * innerWidth);
  const yAt = (level: number) => PADDING + innerHeight - (level / 5) * innerHeight;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Biểu đồ thang kỹ năng theo tháng: ${withData
        .map(
          (item) =>
            `${item.label} ${item.points[item.points.length - 1].level.toFixed(1)}/5`,
        )
        .join(", ")}`}
      className="h-auto w-full"
    >
      {/* Trục Y 0→5 */}
      {[0, 1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <line
            x1={PADDING}
            y1={yAt(level)}
            x2={WIDTH - PADDING}
            y2={yAt(level)}
            className="stroke-outline-variant/25"
            strokeWidth={1}
          />
          <text
            x={PADDING - 6}
            y={yAt(level)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-[#86948a] font-code-md text-[9px]"
          >
            {level}
          </text>
        </g>
      ))}

      {/* Đường ngang đích (target line) — Q8 */}
      {targetLevel !== null && targetLevel > 0 && (
        <>
          <line
            x1={PADDING}
            y1={yAt(targetLevel)}
            x2={WIDTH - PADDING}
            y2={yAt(targetLevel)}
            stroke="var(--color-tertiary)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <text
            x={WIDTH - PADDING}
            y={yAt(targetLevel) - 4}
            textAnchor="end"
            className="fill-[#ffb95f] font-label-sm text-[9px]"
          >
            Mục tiêu {targetLevel.toFixed(1)}
          </text>
        </>
      )}

      {/* Series theo domain */}
      {withData.map((item) => {
        const path = item.points
          .map((point, index) => `${xAt(index)},${yAt(point.level)}`)
          .join(" ");
        return (
          <g key={item.domain}>
            <polyline
              points={path}
              fill="none"
              stroke={STROKE_BY_DOMAIN[item.domain] ?? "var(--color-primary)"}
              strokeWidth={2}
            />
            {item.points.map((point, index) => (
              <circle
                key={point.month}
                cx={xAt(index)}
                cy={yAt(point.level)}
                r={3}
                fill={STROKE_BY_DOMAIN[item.domain] ?? "var(--color-primary)"}
              />
            ))}
          </g>
        );
      })}

      {/* Nhãn tháng */}
      {withData[0].points.map((point, index) => (
        <text
          key={point.month}
          x={xAt(index)}
          y={HEIGHT - 10}
          textAnchor="middle"
          className="fill-[#86948a] font-code-md text-[9px]"
        >
          {point.month.slice(5)}
        </text>
      ))}
    </svg>
  );
}
