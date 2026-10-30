"use client";

import { cn } from "@/lib/cn";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/**
 * `Sheet` — panel trượt lên từ dưới (bottom sheet).
 *
 * **Vì sao tách khỏi `Modal.tsx`?** `Modal.tsx` nằm trong nhóm file của agent
 * khác; `Sheet` là primitive dùng chung cho Quick-log (S05) và các sheet khác
 * nên cần một file riêng để không xung đột (tasks.md 3.6).
 *
 * Khác biệt so với bản `Sheet` nằm trong `Modal.tsx`: bản này có **quản lý
 * tiêu điểm** (NFR-06):
 *   1. Khi mở → đưa tiêu điểm vào trong sheet (vào phần tử tập trung được đầu
 *      tiên, hoặc chính panel nếu không có).
 *   2. Giữ Tab **bên trong** sheet (focus trap) — không lọt xuống trang nền.
 *   3. Khi đóng → trả tiêu điểm về phần tử đã mở sheet.
 *   4. Escape đóng sheet.
 *   5. Khoá cuộn body khi mở để nền không nhảy.
 *
 * Xem design.md §4.5 (Quick-log sheet) · tasks.md 3.6 · NFR-06.
 */

// Re-export `cn` theo yêu cầu task 3.6: file này là entry point của primitive
// `Sheet`, đồng thời là nơi gom tiện ích class cho các primitive khác.
export { cn };

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Bề rộng tối đa — `max-w-3xl` mặc định (khớp mockup Quick-log). */
  width?: string;
  /** Ẩn nút đóng ở góc trên bên phải. */
  hideCloseButton?: boolean;
};

/** Selector cho mọi phần tử tập trung được bên trong một container. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-3xl",
  hideCloseButton = false,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  /** Đưa tiêu điểm vào phần tử tập trung được đầu tiên trong sheet. */
  const focusFirst = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? panel).focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    // Nhớ phần tử đang focus để trả lại sau khi đóng (NFR-06).
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Đưa tiêu điểm vào sheet sau khi panel đã render.
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    // Khoá cuộn nền khi sheet mở.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Trả tiêu điểm về nơi đã mở sheet.
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, focusFirst]);

  /** Giữ Tab bên trong sheet — không lọt xuống trang nền. */
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-surface-container-lowest/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Sheet"}
      onClick={onClose}
      data-testid="sheet-overlay"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-t-xl border-t border-outline-variant/40",
          "bg-surface-container shadow-lg outline-none",
          width,
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        data-testid="sheet-panel"
      >
        {/* Thanh kéo — gợi ý trực quan sheet có thể vuốt (mockup S05). */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-container-highest" aria-hidden />

        {title ? (
          <div className="flex items-start justify-between gap-gutter px-gutter pt-2">
            <div className="min-w-0">
              <h2 id={titleId} className="font-headline-sm text-on-surface">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>
              ) : null}
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                className="material-symbols-outlined shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
                aria-label="Đóng"
              >
                close
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="p-gutter">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-container p-gutter">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
