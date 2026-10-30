"use client";

import { cn } from "@/components/ui/Button";
import { Label } from "@/components/ui/Card";
import type { CompareRow, SelfCompareData } from "@/lib/progress-types";

/**
 * `SelfCompareTable` — hiện tại vs 30 ngày trước (task 16.4).
 *
 * - Giá trị cũ được hiển thị **gạch ngang** (`line-through`) để nhìn thấy
 *   ngay đâu là giá trị cũ, đâu là giá trị hiện tại — không chỉ dựa vào vị trí
 *   cột hay màu sắc.
 * - Mọi giá trị **tính từ DB** (`Evidence`, `Review`, `Activity`), không hardcode.
 * - Delta dùng màu `primary` (tăng là tốt) — nhưng luôn kèm dấu +/− và chữ,
 *   không dựa vào màu một mình.
 *
 * Xem tasks.md 16.4 · requirements.md AC 12.5.
 */

/** Định dạng giá trị theo đơn vị. */
function formatValue(value: number | null, format: CompareRow["format"]): string {
  if (value === null) return "—";
  switch (format) {
    case "level":
      return value.toFixed(1);
    case "score":
      return value.toFixed(1);
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "hours":
      return `${value.toFixed(1)}`;
    case "count":
      return String(Math.round(value));
    default:
      return String(value);
  }
}

/** Chênh lệch = hiện tại − trước, định dạng theo cùng quy ước. */
function formatDelta(row: CompareRow): { text: string; improved: boolean } | null {
  if (row.previous === null || row.current === null) return null;
  const delta = row.current - row.previous;
  if (Math.abs(delta) < 0.005) return { text: "không đổi", improved: true };

  const improved = row.higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);

  let text: string;
  switch (row.format) {
    case "level":
    case "score":
      text = `${sign}${abs.toFixed(1)}`;
      break;
    case "percent":
      text = `${sign}${Math.round(abs * 100)}%`;
      break;
    case "hours":
      text = `${sign}${abs.toFixed(1)}`;
      break;
    case "count":
      text = `${sign}${Math.round(abs)}`;
      break;
    default:
      text = `${sign}${abs}`;
  }
  return { text, improved };
}

export function SelfCompareTable({
  data,
  className,
}: {
  /** Bảng so sánh đã tính ở server. */
  data: SelfCompareData;
  className?: string;
}) {
  return (
    <div className={cn("space-y-space-md", className)} data-testid="self-compare-table">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">
          So sánh chỉ số hiện tại với {data.periodLabel} trước đó
        </caption>
        <thead>
          <tr className="border-b border-outline-variant/30 text-left">
            <th scope="col" className="py-2 font-label-md text-on-surface-variant">
              Chỉ số
            </th>
            <th
              scope="col"
              className="py-2 text-right font-label-md text-on-surface-variant"
            >
              {data.periodLabel} trước
            </th>
            <th
              scope="col"
              className="py-2 text-right font-label-md text-on-surface-variant"
            >
              Hiện tại
            </th>
            <th scope="col" className="py-2 text-right font-label-md text-on-surface-variant">
              Delta
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const delta = formatDelta(row);
            return (
              <tr key={row.key} className="border-b border-outline-variant/20 align-top">
                <th scope="row" className="py-2 pr-gutter text-left font-normal">
                  <div className="font-label-md text-on-surface">{row.label}</div>
                  <div className="text-body-sm text-on-surface-variant">{row.description}</div>
                </th>
                {/* Giá trị cũ — gạch ngang. */}
                <td className="py-2 text-right">
                  <span
                    className="font-code-md text-outline line-through"
                    data-testid={`compare-previous-${row.key}`}
                  >
                    {formatValue(row.previous, row.format)}
                  </span>
                  {row.previous !== null ? (
                    <span className="ml-1 font-label-sm text-outline">{row.unit}</span>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  <span
                    className="font-code-md font-semibold text-on-surface"
                    data-testid={`compare-current-${row.key}`}
                  >
                    {formatValue(row.current, row.format)}
                  </span>
                  <span className="ml-1 font-label-sm text-on-surface-variant">{row.unit}</span>
                </td>
                <td className="py-2 text-right">
                  {delta ? (
                    <span
                      className={cn(
                        "font-code-md font-semibold",
                        delta.improved ? "text-primary" : "text-error",
                      )}
                    >
                      {delta.text}
                    </span>
                  ) : (
                    <span className="font-code-md text-outline">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Label>
        Mốc so sánh: {data.periodLabel} trước · giá trị cũ gạch ngang · mọi chỉ số tính từ DB
      </Label>
    </div>
  );
}
