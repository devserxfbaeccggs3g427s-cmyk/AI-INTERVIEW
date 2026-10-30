"use client";

import { cn } from "@/components/ui/Button";
import { Label } from "@/components/ui/Card";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { color } from "@/styles/tokens";
import type { ActivityBucketDTO } from "@/lib/skills-data";

/**
 * Biểu đồ cột "Phân bổ hoạt động theo danh mục" (task 7.9).
 *
 * 6 danh mục cố định: Học · Luyện tập · Viết · Nói · Ôn · Nhật ký — ánh xạ từ
 * `ACTIVITY_TYPES` trong `src/lib/skills-data.ts`.
 *
 * Vì đây là **danh mục hỗ nominal** (không phải thang đo), ta dùng **một màu
 * duy nhất** cho toàn bộ cột. Dùng value-ramp theo giá trị trên danh mục
 * nominal là anti-pattern (dataviz): sẽ gợi ý sai rằng màu mang nghĩa thứ
 * bậc. Số liệu được gắn nhãn trực tiếp trên cột để không cần đọc màu.
 *
 * Xem tasks.md 7.9 · design.md §4.4.
 */

/** Tooltip — bổ sung thông tin, không phải điều kiện để đọc số liệu. */
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ActivityBucketDTO }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-label-md text-on-surface">{bucket.label}</div>
      <div className="font-code-md text-label-sm text-on-surface-variant">
        {bucket.count} bản ghi
      </div>
      {bucket.averageRating > 0 ? (
        <div className="font-code-md text-label-sm text-on-surface-variant">
          Rating TB {bucket.averageRating}/4
        </div>
      ) : null}
    </div>
  );
}

export function BarChart({
  data,
  className,
}: {
  /** 6 danh mục — `count` = số bản ghi, `averageRating` = điểm TB. */
  data: ActivityBucketDTO[];
  className?: string;
}) {
  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");
  const barColor = color("secondary");

  const maxValue = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={cn("space-y-space-md", className)} data-testid="bar-chart">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={data}
            margin={{ top: 16, right: 12, bottom: 0, left: -18 }}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke={gridColor} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
            />
            <YAxis
              domain={[0, maxValue]}
              allowDecimals={false}
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
              width={44}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: gridColor, fillOpacity: 0.25 }} />
            {/* Một series → không cần legend; số liệu gắn nhãn trực tiếp trên cột. */}
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={barColor} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>

      {/* Bảng số liệu — twin của biểu đồ. */}
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Phân bổ hoạt động theo 6 danh mục</caption>
        <thead>
          <tr className="border-b border-outline-variant/30 text-left">
            <th scope="col" className="py-1 font-label-md text-on-surface-variant">
              Danh mục
            </th>
            <th scope="col" className="py-1 font-label-md text-on-surface-variant">
              Bản ghi
            </th>
            <th scope="col" className="py-1 font-label-md text-on-surface-variant">
              Rating TB
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-b border-outline-variant/20">
              <td className="py-1 text-on-surface">{d.label}</td>
              <td className="py-1 font-code-md text-on-surface-variant">{d.count}</td>
              <td className="py-1 font-code-md text-on-surface-variant">
                {d.averageRating > 0 ? `${d.averageRating}/4` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Label>{data.length} danh mục · tổng {data.reduce((acc, d) => acc + d.count, 0)} bản ghi</Label>
    </div>
  );
}
