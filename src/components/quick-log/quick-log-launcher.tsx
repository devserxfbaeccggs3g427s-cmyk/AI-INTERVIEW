"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { QuickLogSheet } from "@/components/quick-log/quick-log-sheet";
import {
  registerQuickLogBridge,
  unregisterQuickLogBridge,
  type QuickLogContext,
} from "@/components/daily-loop/quick-log-trigger";

/**
 * Launcher Quick-log — mở sheet từ bất kỳ đâu trên S01 (FR-QL-01, FR-DL-04).
 *
 * ⚠️ FR-QL-01 — sheet hiện **ngay lập tức**, không phụ thuộc bất kỳ request nào.
 * Danh sách kỹ năng chỉ được tải *sau khi* sheet đã mở (bước 2), nên người
 * dùng không phải chờ.
 */
export interface QuickLogLauncherProps {
  /** Ngày (yyyy-MM-dd). */
  date: string;
}

export function QuickLogLauncher({ date }: QuickLogLauncherProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<QuickLogContext>({ date });

  // Đăng ký bridge để `QuickLogTrigger` (S01) mở được sheet này.
  useEffect(() => {
    registerQuickLogBridge((ctx) => {
      setContext(ctx);
      setOpen(true);
    });

    return () => unregisterQuickLogBridge();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setContext({ date });
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-3 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="bolt" size={16} />
        Ghi nhanh (≤10s)
      </button>

      {open && (
        <QuickLogSheet
          date={context.date}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
