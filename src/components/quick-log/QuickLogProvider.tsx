"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Dữ liệu prefill khi mở Quick-log từ 1 slot của kế hoạch (FR-DL-04). */
export type QuickLogPrefill = {
  domain?: string;
  skillId?: string | null;
  title?: string;
  minutes?: number;
};

type QuickLogContextValue = {
  isOpen: boolean;
  prefill: QuickLogPrefill | null;
  open: (prefill?: QuickLogPrefill) => void;
  close: () => void;
};

const QuickLogContext = createContext<QuickLogContextValue | null>(null);

export function useQuickLog(): QuickLogContextValue {
  const ctx = useContext(QuickLogContext);
  if (!ctx) {
    throw new Error("useQuickLog phải nằm trong <QuickLogProvider>");
  }
  return ctx;
}

/**
 * Provider cho Quick-log sheet.
 *
 * Mount 1 lần ở `src/app/layout.tsx` (design.md §2.2). Mở được bằng:
 *   - CTA "+ Ghi nhanh" ở Topbar
 *   - phím `Cmd/Ctrl+K`
 *   - nút "Hoàn thành nhanh" ở SlotCard (S01) — kèm prefill
 */
export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<QuickLogPrefill | null>(null);

  const open = useCallback((next?: QuickLogPrefill) => {
    setPrefill(next ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, prefill, open, close }),
    [isOpen, prefill, open, close],
  );

  return <QuickLogContext.Provider value={value}>{children}</QuickLogContext.Provider>;
}
