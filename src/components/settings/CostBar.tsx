"use client";

/**
 * CostBar — phân bổ chi phí theo 8 feature (task 17.3).
 *
 * Tách riêng provider `local` (0 token, chi phí 0) khỏi provider `anthropic`
 * để stack bar chỉ hiển thị chi phí thật từ cloud.
 *
 * Xem tasks.md 17.3 · design.md §4.15 Card "Phân Bổ Chi Phí Theo Tính Năng".
 */

import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Chip, Badge } from "@/components/ui/Chip";
import type { CostByFeature, CostByProvider } from "@/lib/settings/cost-data";
import { color } from "@/styles/tokens";
import { cn } from "@/lib/cn";

function formatMoney(value: number): string {
  if (value === 0) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * `CostBar` — biểu đồ cột ngang cho 8 feature group.
 *
 * Props:
 *  - `features`: mảng `CostByFeature` từ `getAggregateData`.
 *  - `providers`: mảng `CostByProvider` để lookup chi phí provider.
 */
export function CostBar({ features, providers }: {
  features: CostByFeature[];
  providers: CostByProvider[];
}) {
  const totalCost = features.reduce((s, f) => s + f.cost, 0);

  const CHART_COLORS = [
    color("primary"),
    color("secondary"),
    color("tertiary"),
    color("error"),
    color("surface-tint"),
    color("on-secondary"),
    color("on-tertiary"),
    color("on-error"),
  ];

  if (features.length === 0) {
    return (
      <Card padded>
        <CardHeader title="Phân bổ chi phí theo tính năng" subtitle="Chưa có dữ liệu chi phí." icon="bar_chart" />
        <Label>Chưa có lượt gọi AI nào trong tháng này.</Label>
      </Card>
    );
  }

  return (
    <Card padded>
      <CardHeader title="Phân bổ chi phí theo tính năng" subtitle={`${totalCost > 0 ? formatMoney(totalCost) : "$0.00"} tổng`} icon="bar_chart" />
      <div className="space-y-3">
        {features.map((f, i) => {
          const barColor = CHART_COLORS[i % CHART_COLORS.length];
          const pct = totalCost > 0 ? (f.cost / totalCost) * 100 : 0;
          const providerRow = providers.find((p) => p.provider === f.provider);
          const providerCost = providerRow?.cost ?? 0;
          const providerPct = providerCost > 0 ? (f.cost / providerCost) * 100 : 0;
          return (
            <div key={f.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Chip tone="neutral" icon="smart_toy">
                    {f.label}
                  </Chip>
                  <span className="font-body-sm text-on-surface-variant">
                    {f.calls} lượt
                  </span>
                </div>
                <div className="flex items-center gap-2 font-body-sm">
                  <span className="text-primary font-semibold">{formatMoney(f.cost)}</span>
                  <span className="text-on-surface-variant">({formatPercent(pct)})</span>
                  {f.provider === "local" ? null : (
                    <Chip tone="tertiary">
                      {f.model}
                    </Chip>
                  )}
                </div>
              </div>
              <div className="h-4 w-full rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
