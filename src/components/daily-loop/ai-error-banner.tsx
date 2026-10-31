"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Banner "AI lỗi" + nút "Thử lại" (task 24.3, AC-DL-6).
 *
 * ⚠️ Khi AI lỗi, server vẫn sinh kế hoạch fallback ⇒ S01 **không bao giờ
 * trắng**. Banner này giải thích *tại sao* kế hoạch đang là fallback, và cho
 * người dùng nút thử lại.
 */
export interface AiErrorBannerProps {
  /** Ngày (yyyy-MM-dd). */
  date: string;
  /** Thông điệp lỗi từ server (đã thân thiện). */
  message: string;
}

export function AiErrorBanner({ date, message }: AiErrorBannerProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mode: "generate", keepDone: true }),
      });
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-space-sm rounded-xl border border-error/30 bg-error-container/20 p-space-md"
    >
      <Icon name="error" size={20} className="text-error" />

      <div className="min-w-0 flex-1">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-error">
          AI không sinh được kế hoạch
        </span>
        <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
          {message} Đang dùng kế hoạch dựng bằng rule cục bộ — vẫn dùng được ngay.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void retry()}
        disabled={retrying}
        className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:brightness-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="refresh" size={16} />
        {retrying ? "Đang thử…" : "Thử lại"}
      </button>
    </div>
  );
}
