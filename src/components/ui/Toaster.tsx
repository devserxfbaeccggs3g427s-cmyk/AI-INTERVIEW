"use client";

import { cn } from "@/components/ui/Button";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

type ToastInput = Omit<Toast, "id">;

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast phải nằm trong <ToastProvider>");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { ...input, id }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.tone === "error" ? 8000 : 4000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-primary/40 bg-primary-container/15 text-on-surface",
  error: "border-error/40 bg-error-container/20 text-on-surface",
  info: "border-secondary/35 bg-secondary-container/25 text-on-surface",
  warning: "border-tertiary/40 bg-tertiary-container/20 text-on-surface",
};

const TONE_ICONS: Record<ToastTone, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
  warning: "warning",
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-gutter right-gutter z-[120] flex w-full max-w-sm flex-col gap-space-md"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-space-md rounded-lg border p-gutter shadow-lg backdrop-blur-xl",
            "bg-surface-container-high/95",
            TONE_STYLES[t.tone],
          )}
        >
          <span className="material-symbols-outlined shrink-0 mt-0.5" aria-hidden>
            {TONE_ICONS[t.tone]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-body-md font-semibold">{t.title}</div>
            {t.description ? (
              <div className="mt-0.5 text-body-sm text-on-surface-variant">{t.description}</div>
            ) : null}
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
                className="mt-2 font-label-md text-primary hover:underline"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface shrink-0"
            aria-label="Đóng thông báo"
          >
            close
          </button>
        </div>
      ))}
    </div>
  );
}
