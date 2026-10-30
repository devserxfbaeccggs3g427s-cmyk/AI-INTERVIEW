"use client";

/**
 * Nút "Xuất JSON" — tải file thực sự (Blob + download).
 *
 * Tách ra khỏi `src/app/review/page.tsx` vì page file là Server Component —
 * không được truyền `onClick` (event handler) xuống Client Component.
 *
 * Xem design.md §4.13: "Xuất JSON" phải tải file thực, không chỉ toast.
 */

import { cn } from "@/lib/cn";

export function ExportJsonButton({
  payload,
  weekLabel,
}: {
  payload: {
    summary: { weekKey: string };
    previous: unknown;
    runState: unknown;
    reliefNote: string | null;
    slotCount: number;
  };
  weekLabel: string;
}) {
  const handleClick = () => {
    const data = {
      weekKey: payload.summary.weekKey,
      weekRange: weekLabel,
      summary: payload.summary,
      previous: payload.previous,
      runState: payload.runState,
      reliefNote: payload.reliefNote,
      slotCount: payload.slotCount,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-review-${payload.summary.weekKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-all",
        "h-10 px-4 text-body-md gap-2",
        "bg-secondary-container text-on-secondary-container hover:brightness-110",
      )}
      data-testid="export-json"
    >
      <span className="material-symbols-outlined" aria-hidden>
        download
      </span>
      Xuất JSON
    </button>
  );
}
