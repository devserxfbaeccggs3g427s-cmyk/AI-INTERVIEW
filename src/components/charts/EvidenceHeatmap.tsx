"use client";

import { cn } from "@/components/ui/Button";
import { Label } from "@/components/ui/Card";
import { useState } from "react";
import { DOMAINS, type Domain } from "@/lib/types";
import type { HeatmapCounts, HeatmapData } from "@/lib/progress-types";

/**
 * `EvidenceHeatmap` — lưới 90 ngày mật độ bằng chứng (task 16.3).
 *
 * - Lưới **13 tuần × 7 ngày**, mỗi cột là 1 tuần (thứ Hai → chủ nhật).
 * - **Chỉ tô ô có sản phẩm thực tế**: ô được tô khi có ít nhất 1 `Evidence`
 *   tạo trong ngày đó. Ô trống = không có sản phẩm (P3 — không tô theo
 *   "đã mở app" hay "đã tick").
 * - Màu là **thang tuần tự 1 hue** (primary), không phải 4 màu domain:
 *   heatmap encode *magnitude*, không encode identity.
 * - Ngày thật của **năm hiện tại** — lưới được dựng từ `startOfWeek(new Date())`
 *   ở server, tuyệt đối không hardcode chu kỳ của mockup.
 *
 * Xem tasks.md 16.3 · requirements.md AC 12.4 / 12.11.
 */

/** 5 bậc mật độ — 0 = không có bằng chứng (ô trống, không tô). */
const LEVEL_CLASSES = [
  "", // 0 — không tô
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/60",
  "bg-primary",
];

/** Ngưỡng "nhiều" — từ bậc này trở lên là màu đậm nhất. */
const MAX_LEVEL = LEVEL_CLASSES.length - 1;

/** Số bằng chứng → bậc màu 1..4 (0 = không tô). */
function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return MAX_LEVEL;
}

/** Ngày trong tuần → tên tiếng Việt (index 0 = Thứ Hai). */
const WEEKDAY_LONG = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

export function EvidenceHeatmap({
  data,
  counts,
  /** Domain đang lọc — chỉ tính bằng chứng của domain này (task 16.6). */
  activeDomain = null,
  className,
}: {
  /** Lưới + chỉ số chuỗi/ngày năng suất. */
  data: HeatmapData;
  /** Số bằng chứng theo `dateKey`, tách theo domain. */
  counts: HeatmapCounts;
  /** Lọc domain (task 16.6). `null` = tất cả. */
  activeDomain?: Domain | null;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  // Ô nào có bao nhiêu bằng chứng, tính theo domain đang lọc.
  const countFor = (key: string): number => {
    if (activeDomain) return counts[activeDomain]?.[key] ?? 0;
    let total = 0;
    for (const domain of DOMAINS) total += counts[domain]?.[key] ?? 0;
    return total;
  };

  // Chia lưới thành 13 cột × 7 hàng.
  const columns: Array<Array<{ dateKey: string; isFuture: boolean }>> = [];
  for (let col = 0; col < data.weekStarts.length; col += 1) {
    columns.push(data.grid.slice(col * 7, col * 7 + 7));
  }

  // Ngày có bằng chứng (đã lọc domain) — dùng cho bảng twin + chuỗi.
  const activeDays = data.grid
    .filter((cell) => !cell.isFuture)
    .map((cell) => ({ ...cell, count: countFor(cell.dateKey) }))
    .filter((cell) => cell.count > 0);

  return (
    <div className={cn("space-y-space-md", className)} data-testid="evidence-heatmap">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <span className="flex items-center gap-1.5 font-label-md text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
            calendar_month
          </span>
          Chu kỳ {data.grid.length} ngày · chỉ tô ô có sản phẩm thực tế
        </span>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="font-label-md text-secondary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? "Ẩn bảng" : "Xem bảng"}
        </button>
      </div>

      {/* Lưới — 13 cột × 7 hàng, cuộn ngang trên màn hình hẹp. */}
      <div className="overflow-x-auto pb-space-xs">
        <div className="flex min-w-[720px] gap-2">
          {/* Nhãn thứ trong tuần */}
          <div className="flex w-8 shrink-0 flex-col justify-between py-0.5 text-right font-label-sm text-outline">
            <span>T2</span>
            <span>T4</span>
            <span>T6</span>
            <span>CN</span>
          </div>

          <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1.5">
            {columns.map((column, colIndex) =>
              column.map((cell, rowIndex) => {
                const count = countFor(cell.dateKey);
                const level = levelFor(count);
                const weekdayName = WEEKDAY_LONG[rowIndex] ?? "";
                return (
                  <div
                    key={cell.dateKey}
                    className={cn(
                      "h-3.5 w-3.5 rounded-sm",
                      cell.isFuture ? "bg-surface-container-low" : LEVEL_CLASSES[level],
                    )}
                    title={
                      cell.isFuture
                        ? `${cell.dateKey} — ngày chưa tới`
                        : `${cell.dateKey} · ${weekdayName} — ${count} bằng chứng`
                    }
                    aria-label={
                      cell.isFuture
                        ? `${cell.dateKey} — ngày chưa tới`
                        : `${cell.dateKey} — ${count} bằng chứng`
                    }
                    data-count={count}
                    data-testid={`heatmap-cell-${colIndex}-${rowIndex}`}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* Chú giải màu — thang tuần tự 1 hue, luôn có nhãn chữ. */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-2 font-label-sm text-outline">
          <span>Ít</span>
          <div className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-surface-container-low" aria-hidden />
            <span className="h-3 w-3 rounded-sm bg-primary/20" aria-hidden />
            <span className="h-3 w-3 rounded-sm bg-primary/40" aria-hidden />
            <span className="h-3 w-3 rounded-sm bg-primary/60" aria-hidden />
            <span className="h-3 w-3 rounded-sm bg-primary" aria-hidden />
          </div>
          <span>Nhiều (≥ 4 bằng chứng/ngày)</span>
        </div>
        <div className="flex flex-wrap items-center gap-space-md font-label-sm text-on-surface-variant">
          <span>
            Chuỗi liên tục dài nhất:{" "}
            <strong className="text-on-surface">{data.longestStreak} ngày</strong>
          </span>
          {data.bestWeekday ? (
            <span>
              Ngày năng suất nhất:{" "}
              <strong className="text-on-surface">
                {data.bestWeekday.label} (tb {data.bestWeekday.average} bằng chứng)
              </strong>
            </span>
          ) : null}
        </div>
      </div>

      {/* Bảng dữ liệu — twin của lưới, để không gate thông tin vào màu. */}
      {showTable ? (
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">
            Bằng chứng theo ngày trong 90 ngày gần nhất
          </caption>
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th scope="col" className="py-1 font-label-md text-on-surface-variant">
                Ngày
              </th>
              <th scope="col" className="py-1 text-right font-label-md text-on-surface-variant">
                Bằng chứng
              </th>
            </tr>
          </thead>
          <tbody>
            {activeDays.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="py-2 font-label-md text-on-surface-variant"
                >
                  Chưa có bằng chứng trong chu kỳ này.
                </td>
              </tr>
            ) : (
              activeDays.map((day) => (
                <tr key={day.dateKey} className="border-b border-outline-variant/20">
                  <td className="py-1 font-code-md text-on-surface-variant">{day.dateKey}</td>
                  <td className="py-1 text-right font-code-md text-on-surface">{day.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <Label>
          {activeDays.length} ngày có sản phẩm · {activeDays.reduce((acc, d) => acc + d.count, 0)}{" "}
          bằng chứng
        </Label>
      )}
    </div>
  );
}
