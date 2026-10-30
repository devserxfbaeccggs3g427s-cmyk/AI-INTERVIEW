"use client";

/**
 * Bảng chi tiết chi phí theo (provider, model) — task 17.4.
 *
 * Cột: Provider, Model, Số lượt, Chi phí, % tổng, Fallback từ.
 *
 * Xem tasks.md 17.4 · design.md §4.15.
 */

import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Label } from "@/components/ui/Card";
import { CostRow } from "@/lib/settings/cost-data";

export function CostTable({ rows }: { rows: CostRow[] }) {
  if (rows.length === 0) {
    return <Label>Chưa có dữ liệu chi phí.</Label>;
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <Card padded>
      <CardHeader title="Chi tiết theo Provider / Model" subtitle={`${rows.length} tổ hợp provider-model`} icon="table_chart" />
      <div className="overflow-x-auto rounded-lg bg-surface-container-lowest">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead className="bg-surface-container text-outline font-label-sm text-label-sm uppercase tracking-wider">
            <tr>
              <th className="py-3 px-gutter">Provider</th>
              <th className="py-3 px-gutter">Model</th>
              <th className="py-3 px-gutter text-right">Số lượt</th>
              <th className="py-3 px-gutter text-right">Chi phí (USD)</th>
              <th className="py-3 px-gutter text-right">% Tổng</th>
              <th className="py-3 px-gutter text-center">Fallback từ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10 text-on-surface font-code-md text-code-md">
            {rows.map((r, i) => (
              <tr key={`${r.provider}-${r.model}-${i}`} className="hover:bg-surface-container/60 transition-colors">
                <td className="py-3.5 px-gutter">
                  <Chip
                    tone={r.provider === "local" ? "secondary" : "primary"}
                    icon={r.provider === "local" ? "memory" : "cloud"}
                  >
                    {r.provider}
                  </Chip>
                </td>
                <td className="py-3.5 px-gutter text-on-surface">{r.model}</td>
                <td className="py-3.5 px-gutter text-right">{r.calls}</td>
                <td className="py-3.5 px-gutter text-right text-on-surface font-semibold">
                  {formatMoney(r.cost)}
                </td>
                <td className="py-3.5 px-gutter text-right text-primary font-medium">
                  {totalCost > 0 ? ((r.cost / totalCost) * 100).toFixed(1) + "%" : "0%"}
                </td>
                <td className="py-3.5 px-gutter text-center">
                  {r.fallbackFrom ? (
                    <Chip tone="tertiary" icon="swap_horiz">
                      {r.fallbackFrom}
                    </Chip>
                  ) : (
                    <span className="text-outline">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatMoney(value: number): string {
  return `$${value.toFixed(4)}`;
}
