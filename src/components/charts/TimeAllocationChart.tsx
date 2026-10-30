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
import { DOMAIN_COLORS } from "@/components/charts/TrajectoryChart";
import type { PracticeGroup, TimeAllocationData } from "@/lib/progress-types";

/**
 * `TimeAllocationChart` — phân bổ thời gian thực chiến theo 4 domain (task 16.5).
 *
 * - **Chỉ tính `Activity.minutes` của hoạt động có ít nhất 1 `Evidence`** —
 *   tức là thời gian đã tạo ra sản phẩm thật (P7: không có vanity metric
 *   "tổng giờ học").
 * - 4 nhóm là 4 domain → màu gán theo domain, **không** phải value-ramp theo
 *   giá trị (danh mục nominal không có thứ tự).
 * - Mỗi nhóm có danh sách sản phẩm thực tế đi kèm (AC 12.6) + tỷ trọng %.
 *
 * Xem tasks.md 16.5 · requirements.md AC 12.6 / 12.7.
 */

/** Tooltip — bổ sung, không phải điều kiện để đọc số liệu. */
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PracticeGroup }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const group = payload[0]?.payload;
  if (!group) return null;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high px-space-md py-space-sm shadow-lg">
      <div className="font-label-md text-on-surface">{group.label}</div>
      <div className="font-code-md text-label-sm text-on-surface-variant">
        {group.hours.toFixed(1)} giờ · {Math.round(group.share * 100)}% tổng
      </div>
      <div className="font-code-md text-label-sm text-on-surface-variant">
        {group.activityCount} hoạt động có sản phẩm · {group.evidenceCount} bằng chứng
      </div>
    </div>
  );
}

export function TimeAllocationChart({
  data,
  /** Domain đang lọc — chỉ nhóm tương ứng được vẽ (task 16.6). */
  activeDomain = null,
  className,
}: {
  /** Phân bổ thời gian đã tính ở server. */
  data: TimeAllocationData;
  /** Lọc domain (task 16.6). `null` = tất cả. */
  activeDomain?: string | null;
  className?: string;
}) {
  const axisColor = color("outline");
  const gridColor = color("outline-variant");
  const textColor = color("on-surface-variant");

  const groups = activeDomain
    ? data.groups.filter((g) => g.domain === activeDomain)
    : data.groups;

  const maxHours = Math.max(...groups.map((g) => g.hours), 0.1);

  return (
    <div className={cn("space-y-space-md", className)} data-testid="time-allocation-chart">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={groups}
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
              domain={[0, maxHours]}
              allowDecimals={false}
              tick={{ fill: textColor, fontSize: 11, fontFamily: "JetBrains Mono" }}
              stroke={axisColor}
              tickLine={false}
              axisLine={{ stroke: axisColor }}
              width={44}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: gridColor, fillOpacity: 0.25 }} />
            {/* 1 series (giờ thực chiến) — màu gán theo domain để nhất quán với quỹ đạo. */}
            <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {groups.map((entry) => (
                <Cell key={entry.domain} fill={DOMAIN_COLORS[entry.domain]} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>

      {/* Danh sách sản phẩm thực tế + tỷ trọng (AC 12.6 / 12.7). */}
      <ul className="space-y-space-md">
        {groups.map((group) => (
          <li key={group.domain} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-space-sm font-body-sm">
              <span className="flex items-center gap-1.5 font-semibold text-on-surface">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: DOMAIN_COLORS[group.domain] }}
                  aria-hidden
                />
                {group.label}
              </span>
              <span className="font-code-md text-on-surface">
                {group.hours.toFixed(1)} giờ
              </span>
            </div>
            {/* Thanh tỷ trọng — 2px track, fill theo màu domain. */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, group.share * 100))}%`,
                  backgroundColor: DOMAIN_COLORS[group.domain],
                }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-space-sm font-label-sm text-outline">
              <span>
                {group.activityCount} hoạt động có sản phẩm · {group.evidenceCount} bằng chứng
              </span>
              <span>{Math.round(group.share * 100)}% tổng thực chiến</span>
            </div>
            {group.products.length > 0 ? (
              <ul className="space-y-0.5 pt-0.5">
                {group.products.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-baseline justify-between gap-space-sm font-label-sm text-on-surface-variant"
                  >
                    <span className="truncate">
                      <span className="text-outline">[{product.typeLabel}]</span> {product.title}
                    </span>
                    <span className="shrink-0 font-code-md">{product.minutes} phút</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="font-label-sm text-outline">
                Chưa có hoạt động có sản phẩm trong nhóm này.
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container px-space-md py-space-sm">
        <span className="flex items-center gap-1.5 font-label-md text-on-surface">
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }} aria-hidden>
            verified_user
          </span>
          Tổng thực chiến hữu ích:{" "}
          <strong className="font-code-md text-on-surface">{data.totalHours.toFixed(1)} giờ</strong>
        </span>
        <span className="font-label-md text-on-surface-variant">
          {data.periodLabel} · 100% có bằng chứng
        </span>
      </div>

      <Label>
        {groups.length} nhóm · tổng {data.totalMinutes} phút · chỉ tính hoạt động có Evidence
      </Label>
    </div>
  );
}
