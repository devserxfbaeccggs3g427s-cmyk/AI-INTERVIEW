"use client";

/**
 * Bảng nhật ký gọi API gần nhất — task 17.4.
 *
 * Cột: Thời gian, Tính năng, Provider, Model, Input Token, Cache Read,
 * Output Token, Chi phí (USD), Trạng thái, Fallback từ.
 *
 * Task 17.5 bổ sung:
 *   - **Phân trang** — 10 dòng / trang, nút "Trước" / "Sau".
 *   - **Eye** — bật/tắt từng cột (mặc định ẩn `Output Token` + `Fallback từ`
 *     vì 2 cột này ít dùng và làm bảng chật).
 *
 * Xem tasks.md 17.4 · 17.5 · design.md §4.15 "Nhật Ký Gọi API Gần Nhất".
 */

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Chip, StatusDot } from "@/components/ui/Chip";
import type { RecentCall } from "@/lib/settings/cost-data";

/** Số dòng hiển thị trên mỗi trang. */
const PAGE_SIZE = 10;

/** Danh sách cột — `key` dùng để bật/tắt. */
const COLUMNS = [
  { key: "time", label: "Thời gian", defaultVisible: true },
  { key: "feature", label: "Tính năng", defaultVisible: true },
  { key: "provider", label: "Provider", defaultVisible: true },
  { key: "model", label: "Model", defaultVisible: true },
  { key: "inputTokens", label: "Input Token", defaultVisible: true },
  { key: "cacheRead", label: "Cache Read", defaultVisible: true },
  { key: "outputTokens", label: "Output Token", defaultVisible: false },
  { key: "estimatedCost", label: "Chi phí (USD)", defaultVisible: true },
  { key: "ok", label: "Trạng thái", defaultVisible: true },
  { key: "fallbackFrom", label: "Fallback từ", defaultVisible: false },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

export function CallLogTable({ calls }: { calls: RecentCall[] }) {
  /** Cột đang hiện — khởi tạo theo `defaultVisible`. */
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible])) as Record<ColumnKey, boolean>,
  );
  const [page, setPage] = useState(0);

  const isVisible = (key: ColumnKey) => visible[key];

  const totalPages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => calls.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [calls, currentPage],
  );

  const toggleColumn = (key: ColumnKey) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
    setPage(0);
  };

  if (calls.length === 0) {
    return <Label>Chưa có nhật ký gọi API.</Label>;
  }

  return (
    <Card padded>
      <CardHeader
        title="Nhật Ký Gọi API Gần Nhất"
        subtitle={`${calls.length} lượt gần nhất — Schema: AiCall`}
        icon="history"
        action={
          <div className="flex flex-wrap items-center gap-1">
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                type="button"
                onClick={() => toggleColumn(col.key)}
                aria-pressed={isVisible(col.key)}
                title={`${isVisible(col.key) ? "Ẩn" : "Hiện"} cột ${col.label}`}
                className={
                  isVisible(col.key)
                    ? "inline-flex h-6 items-center gap-1 rounded-md bg-secondary-container/50 px-2 text-label-sm text-on-secondary-container"
                    : "inline-flex h-6 items-center gap-1 rounded-md px-2 text-label-sm text-outline hover:bg-surface-container"
                }
              >
                <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
                  {isVisible(col.key) ? "visibility" : "visibility_off"}
                </span>
                {col.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-lg bg-surface-container-lowest">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead className="bg-surface-container text-outline font-label-sm text-label-sm uppercase tracking-wider">
            <tr>
              {isVisible("time") && <th className="py-3 px-gutter">Thời gian</th>}
              {isVisible("feature") && <th className="py-3 px-gutter">Tính năng</th>}
              {isVisible("provider") && <th className="py-3 px-gutter">Provider</th>}
              {isVisible("model") && <th className="py-3 px-gutter">Model</th>}
              {isVisible("inputTokens") && <th className="py-3 px-gutter text-right">Input Token</th>}
              {isVisible("cacheRead") && <th className="py-3 px-gutter text-right">Cache Read</th>}
              {isVisible("outputTokens") && <th className="py-3 px-gutter text-right">Output Token</th>}
              {isVisible("estimatedCost") && <th className="py-3 px-gutter text-right">Chi phí (USD)</th>}
              {isVisible("ok") && <th className="py-3 px-gutter text-center">Trạng thái</th>}
              {isVisible("fallbackFrom") && <th className="py-3 px-gutter text-center">Fallback từ</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10 text-on-surface font-code-md text-code-md">
            {pageRows.map((c) => (
              <tr key={c.id} className="hover:bg-surface-container/60 transition-colors">
                {isVisible("time") && (
                  <td className="py-3.5 px-gutter text-on-surface-variant">
                    {formatDateTime(c.createdAt)}
                  </td>
                )}
                {isVisible("feature") && (
                  <td className="py-3.5 px-gutter">
                    <Chip tone="neutral" icon="smart_toy">
                      {c.feature}
                    </Chip>
                  </td>
                )}
                {isVisible("provider") && (
                  <td className="py-3.5 px-gutter">
                    <Chip
                      tone={c.provider === "local" ? "secondary" : "primary"}
                      icon={c.provider === "local" ? "memory" : "cloud"}
                    >
                      {c.provider}
                    </Chip>
                  </td>
                )}
                {isVisible("model") && <td className="py-3.5 px-gutter text-on-surface">{c.model}</td>}
                {isVisible("inputTokens") && (
                  <td className="py-3.5 px-gutter text-right">{c.inputTokens.toLocaleString("vi-VN")}</td>
                )}
                {isVisible("cacheRead") && (
                  <td className="py-3.5 px-gutter text-right">
                    <span className={c.cacheRead > 0 ? "text-primary font-semibold" : "text-outline"}>
                      {c.cacheRead > 0 ? `${c.cacheRead.toLocaleString("vi-VN")} (Hit)` : "0"}
                    </span>
                  </td>
                )}
                {isVisible("outputTokens") && (
                  <td className="py-3.5 px-gutter text-right">{c.outputTokens.toLocaleString("vi-VN")}</td>
                )}
                {isVisible("estimatedCost") && (
                  <td className="py-3.5 px-gutter text-right text-on-surface font-semibold">
                    {formatMoney(c.estimatedCost)}
                  </td>
                )}
                {isVisible("ok") && (
                  <td className="py-3.5 px-gutter text-center">
                    <span className="inline-flex items-center gap-1">
                      <StatusDot tone={c.ok ? "primary" : "error"} />
                      <Chip tone={c.ok ? "primary" : "error"} icon={c.ok ? "check_circle" : "error"}>
                        {c.ok ? "OK" : (c.error ?? "Error")}
                      </Chip>
                    </span>
                  </td>
                )}
                {isVisible("fallbackFrom") && (
                  <td className="py-3.5 px-gutter text-center">
                    {c.fallbackFrom ? (
                      <Chip tone="tertiary" icon="swap_horiz">
                        {c.fallbackFrom}
                      </Chip>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Phân trang ── */}
      <div className="mt-gutter flex items-center justify-between gap-3">
        <span className="text-body-sm text-on-surface-variant">
          Trang {currentPage + 1} / {totalPages} · hiển thị {pageRows.length} / {calls.length} lượt
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon="chevron_left"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Trước
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Sau
          </Button>
        </div>
      </div>
    </Card>
  );
}

function formatMoney(value: number): string {
  if (value === 0) return "$0.0000";
  return `$${value.toFixed(4)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}
