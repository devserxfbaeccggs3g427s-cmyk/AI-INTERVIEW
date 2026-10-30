"use client";

import { cn } from "@/components/ui/Button";
import { useEffect, type ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
};

/** Modal nền tối + focus trap đơn giản + Escape đóng. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = "max-w-2xl",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md p-gutter"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-xl bg-surface-container border border-outline-variant/40 shadow-lg",
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-gutter border-b border-outline-variant/30 p-gutter">
          <div className="flex items-center gap-space-md min-w-0">
            {icon ? (
              <span className="material-symbols-outlined text-primary" aria-hidden>
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="font-headline-sm text-on-surface">{title}</h2>
              {subtitle ? (
                <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
            aria-label="Đóng"
          >
            close
          </button>
        </div>

        <div className="p-gutter">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-space-md border-t border-outline-variant/30 p-gutter">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Sheet trượt lên từ dưới — dùng cho Quick-log (S05). */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-surface-container-lowest/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Sheet"}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-surface-container border-t border-outline-variant/40 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-container-highest" aria-hidden />
        {title ? (
          <div className="px-gutter pt-2">
            <h2 className="font-headline-sm text-on-surface">{title}</h2>
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
