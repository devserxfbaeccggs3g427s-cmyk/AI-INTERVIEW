"use client";

import { useCallback, useEffect } from "react";

import { Icon } from "@/components/ui/icon";
import type { Domain } from "@/lib/prompts";

/**
 * Hợp đồng mở sheet Quick-log (FR-DL-04).
 *
 * ⚠️ Feature `daily-loop-core` **chỉ** sở hữu phần *trigger* — sheet Quick-log
 * đầy đủ thuộc feature `quick-log`. Khi feature đó được implement, `bridge`
 * sẽ được nối vào registry của Quick-log; hiện tại trigger gọi callback
 * `onOpen` để test/integration.
 */
export interface QuickLogContext {
  /** Ngày đang thao tác (yyyy-MM-dd). */
  date: string;
  /** Slot liên quan (nếu mở từ 1 slot cụ thể). */
  slot?: number;
  /** Domain gợi ý (nếu mở từ 1 slot cụ thể). */
  domain?: Domain;
  /** Thời lượng dự kiến của slot (phút). */
  minutes?: number;
  /** Kỹ năng gắn với slot. */
  skillId?: string | null;
}

/** Bridge để Quick-log (feature khác) đăng ký handler mở sheet. */
type Bridge = { open: ((ctx: QuickLogContext) => void) | null };

const bridge: Bridge = { open: null };

/** Đăng ký handler mở sheet Quick-log (gọi từ feature `quick-log`). */
export function registerQuickLogBridge(open: (ctx: QuickLogContext) => void): void {
  bridge.open = open;
}

/** Gỡ handler (cleanup). */
export function unregisterQuickLogBridge(): void {
  bridge.open = null;
}

/** Mở sheet Quick-log với context (dùng được từ bất kỳ đâu). */
export function openQuickLog(ctx: QuickLogContext): void {
  bridge.open?.(ctx);
}

export interface QuickLogTriggerProps {
  date: string;
  /** Mở từ 1 slot cụ thể. */
  slot?: number;
  domain?: Domain;
  minutes?: number;
  skillId?: string | null;
  /** Nhãn nút (mặc định "+ Ghi nhanh (≤10s)"). */
  label?: string;
  className?: string;
}

/**
 * Nút mở Quick-log — P2 (ghi nhập <10s): mở **tức thì**, không chờ AI.
 */
export function QuickLogTrigger({
  date,
  slot,
  domain,
  minutes,
  skillId,
  label = "+ Ghi nhanh (≤10s)",
  className,
}: QuickLogTriggerProps) {
  const open = useCallback(() => {
    openQuickLog({ date, slot, domain, minutes, skillId });
  }, [date, slot, domain, minutes, skillId]);

  // Hotkey Ctrl/Cmd + K mở sheet từ bất kỳ đâu trên S01.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
      className={[
        "inline-flex items-center gap-1 rounded-lg bg-primary-container px-3 py-2",
        "font-label-md text-label-md font-semibold text-on-primary",
        "transition hover:brightness-105 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon name="bolt" size={16} />
      {label}
    </button>
  );
}
