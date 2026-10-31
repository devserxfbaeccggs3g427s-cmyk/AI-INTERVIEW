"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Modal "Cân chỉnh lại hôm nay" (FR-DL-06).
 *
 * Hiện rationale (năng lượng, số nhiệm vụ đã chốt) + gợi ý phân bổ lại.
 * Bấm "Áp dụng lịch trình mới" ⇒ gọi `onRegenerate` — server giữ slot `done`
 * qua `mergeRegeneratedPlan` (nội dung slot đã xong không đổi).
 */
export interface ReplanModalProps {
  open: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  /** Năng lượng tuần 0–100. */
  energyPct: number;
  /** Số slot đã hoàn thành (bất biến). */
  doneCount: number;
  /** Số thẻ SRS đến hạn (nếu biết). */
  dueCards?: number | null;
  /** Gợi ý phân bổ — tên slot + thời lượng. */
  suggestions: Array<{ slot: number; label: string; minutes: number }>;
  /** Đang gọi AI. */
  loading?: boolean;
}

export function ReplanModal({
  open,
  onClose,
  onRegenerate,
  energyPct,
  doneCount,
  dueCards,
  suggestions,
  loading = false,
}: ReplanModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape đóng modal + focus kẹp bên trong khi mở.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      // Focus trap: Tab không thoát khỏi modal.
      if (event.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);

    // Focus vào nút đầu tiên khi mở.
    const timer = setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 p-margin backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="replan-title"
        className="w-full max-w-lg rounded-xl bg-surface-container-high p-space-lg shadow-md"
      >
        <div className="flex items-start justify-between gap-space-md">
          <h2
            id="replan-title"
            className="font-headline-md text-headline-md text-on-surface"
          >
            Cân chỉnh lại hôm nay
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1 text-outline transition hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="mt-space-md text-body-sm text-body-sm text-on-surface-variant">
          AI sẽ căn cứ vào mức năng lượng ({energyPct}%), {doneCount} nhiệm vụ đã chốt
          {dueCards !== null && dueCards !== undefined ? `, và ${dueCards} thẻ FSRS quá hạn` : ""} để sắp
          xếp lại thứ tự ưu tiên các slot còn lại.
        </p>

        <div className="mt-space-md rounded-lg bg-surface-container-low p-space-md font-code-md text-code-md text-on-surface">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Gợi ý phân bổ lại
          </span>
          <ul className="mt-space-sm space-y-space-xs">
            {suggestions.map((suggestion) => (
              <li key={suggestion.slot}>
                Slot {suggestion.slot + 1}: {suggestion.label} ({suggestion.minutes}′)
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-space-lg flex flex-wrap justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-variant px-4 py-2 font-label-md text-label-md text-on-surface transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Giữ nguyên
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg bg-secondary-container px-4 py-2 font-label-md text-label-md text-secondary transition hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="neurology" size={16} />
            {loading ? "Đang cân chỉnh…" : "Áp dụng lịch trình mới"}
          </button>
        </div>
      </div>
    </div>
  );
}
