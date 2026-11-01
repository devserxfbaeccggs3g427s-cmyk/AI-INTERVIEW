"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { WeeklyInsights } from "@/lib/weekly-review";

export interface InsightBlockProps {
  insights: WeeklyInsights | null;
  /** Đang stream → hiện skeleton. */
  streaming: boolean;
  error: string | null;
  onRetry: () => void;
  hasApiKey: boolean;
}

/**
 * Khối "Nhận định 3 điểm" (FR-WR-03).
 *
 * ⚠️ Đúng 3 mục: ✓ điều đã làm tốt · ✗ điểm cần sửa · 💡 nên thử tuần sau.
 * ⚠️ Không có API key ⇒ hiện hướng dẫn, **không** giả lập nhận định.
 */
export function InsightBlock({
  insights,
  streaming,
  error,
  onRetry,
  hasApiKey,
}: InsightBlockProps) {
  if (!hasApiKey) {
    return (
      <div className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Nhận định 3 điểm
        </h2>
        <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
          Bật nhận định AI bằng cách thêm API key trong Cài đặt. Số liệu tuần vẫn
          hiển thị đầy đủ ở trên.
        </p>
      </div>
    );
  }

  if (streaming && !insights) {
    return (
      <div
        aria-live="polite"
        className="bg-surface-container p-space-lg rounded-xl"
      >
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Nhận định 3 điểm
        </h2>
        <div className="mt-space-md space-y-space-sm" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded bg-surface-container-highest"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Nhận định 3 điểm
        </h2>
        <p role="alert" className="mt-space-md font-body-md text-body-md text-error">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-space-md rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Nhận định 3 điểm
        </h2>
        <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
          Chưa có nhận định cho tuần này. Bấm “Tự động tổng hợp” để AI phân tích
          dữ liệu tuần.
        </p>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="bg-surface-container p-space-lg rounded-xl">
      <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
        Nhận định 3 điểm
      </h2>

      <ul className="mt-space-md space-y-space-md">
        <li className="flex gap-space-md">
          <Icon name="check_circle" size={20} className="mt-1 shrink-0 text-primary" />
          <div>
            <p className="font-label-md text-label-md text-primary">
              Điều đã làm tốt — {insights.strength.title}
            </p>
            <p className="mt-1 font-body-md text-body-md text-on-surface">
              {insights.strength.body}
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {insights.strength.evidence}
            </p>
          </div>
        </li>

        <li className="flex gap-space-md">
          <Icon name="error" size={20} className="mt-1 shrink-0 text-error" />
          <div>
            <p className="font-label-md text-label-md text-error">
              Điểm cần sửa — {insights.weakness.title}
            </p>
            <p className="mt-1 font-body-md text-body-md text-on-surface">
              {insights.weakness.body}
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {insights.weakness.impact}
            </p>
          </div>
        </li>

        <li className="flex gap-space-md">
          <Icon name="lightbulb" size={20} className="mt-1 shrink-0 text-tertiary" />
          <div>
            <p className="font-label-md text-label-md text-tertiary">
              Nên thử tuần sau — {insights.experiment.title}
            </p>
            <p className="mt-1 font-body-md text-body-md text-on-surface">
              {insights.experiment.body}
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {insights.experiment.rationale}
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}

/** Chip trạng thái domain (Elite / Ổn / Cần can thiệp). */
export function DomainStatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-label-sm text-label-sm",
        status === "elite"
          ? "bg-primary/10 text-primary"
          : status === "ok"
            ? "bg-tertiary/10 text-tertiary"
            : "bg-error/15 text-error",
      )}
    >
      {status === "elite" ? "Elite" : status === "ok" ? "Ổn" : "Cần can thiệp"}
    </span>
  );
}
