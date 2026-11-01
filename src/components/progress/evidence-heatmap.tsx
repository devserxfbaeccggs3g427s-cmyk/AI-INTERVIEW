"use client";

import { useMemo } from "react";

export interface EvidenceHeatmapProps {
  cells: Array<{ date: string; count: number }>;
  /** Số tuần hiển thị (90 ngày / 7). */
  weeks: number;
  /** Ngày bắt đầu — `yyyy-MM-dd`. */
  startDate: string;
}

/** Ngưỡng màu: ≥ 4 evidence/ngày ⇒ đậm nhất. */
const MAX_COUNT = 4;

/**
 * Heatmap tích lũy bằng chứng (FR-PR-02).
 *
 * ⚠️ AC-RP-7: chỉ tô màu ô có `Evidence` thật — ngày không có bằng chứng ⇒ ô
 * nền, **không** tính vào tổng.
 * ⚠️ Task 17.5: `useMemo` cache cells để không tính lại khi đổi filter.
 */
export function EvidenceHeatmap({ cells, weeks, startDate }: EvidenceHeatmapProps) {
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells) map.set(cell.date, cell.count);
    return map;
  }, [cells]);

  const grid = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    // Lùi về Thứ Hai đầu tuần để lưới căn theo tuần.
    const day = start.getDay();
    const monday = new Date(start);
    monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));

    const rows: Array<Array<{ date: string; count: number; future: boolean }>> = [];
    for (let week = 0; week < weeks; week += 1) {
      const row: Array<{ date: string; count: number; future: boolean }> = [];
      for (let day = 0; day < 7; day += 1) {
        const cellDate = new Date(monday);
        cellDate.setDate(monday.getDate() + week * 7 + day);
        const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
        row.push({
          date: key,
          count: countMap.get(key) ?? 0,
          future: cellDate.getTime() > Date.now(),
        });
      }
      rows.push(row);
    }
    return rows;
  }, [countMap, startDate, weeks]);

  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: "2px" }}>
        <caption className="sr-only">
          Heatmap bằng chứng 90 ngày — tổng {total} bằng chứng
        </caption>
        <thead>
          <tr>
            <th scope="col" className="font-label-sm text-label-sm text-outline">
              T2
            </th>
            <th scope="col" className="font-label-sm text-label-sm text-outline">
              T4
            </th>
            <th scope="col" className="font-label-sm text-label-sm text-outline">
              T6
            </th>
            <th scope="col" className="font-label-sm text-label-sm text-outline">
              CN
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.map((row, weekIndex) => (
            <tr key={weekIndex}>
              {row.map((cell, dayIndex) => {
                const level = Math.min(MAX_COUNT, cell.count);
                return (
                  <td
                    key={cell.date}
                    title={`${cell.date}: ${cell.count} bằng chứng`}
                    className={[
                      "h-3 w-3 rounded-sm",
                      cell.count === 0
                        ? "bg-surface-container-highest"
                        : level >= MAX_COUNT
                          ? "bg-primary"
                          : level >= 3
                            ? "bg-primary/70"
                            : level >= 2
                              ? "bg-primary/45"
                              : "bg-primary/25",
                      cell.future ? "opacity-30" : "",
                    ].join(" ")}
                  >
                    <span className="sr-only">
                      {cell.date}: {cell.count} bằng chứng
                    </span>
                    {dayIndex === -1 ? null : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-space-sm font-label-sm text-label-sm text-outline">
        Ít ↔ Nhiều (≥ {MAX_COUNT} evidence/ngày) · tổng {total} bằng chứng
      </p>
    </div>
  );
}
