// `cn` import từ `@/lib/cn` (module KHÔNG có "use client") để `PageHeader` là
// Server Component an toàn — Server Component KHÔNG gọi được hàm export từ
// module client (`@/components/ui/Button`).
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Header chuẩn cho các màn hình nội dung (S02, S03, S04…).
 *
 * Pattern từ mockup Stitch: eyebrow (micro-label mono) → tiêu đề → mô tả →
 * nhóm nút hành động bên phải.
 *
 * Xem design.md §3.3 (typography) · tasks.md 3.6.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  /** Nhãn mono uppercase phía trên tiêu đề — ví dụ "DAILY LOOP OS / KẾ HOẠCH NGÀY". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Nhóm nút hành động (CTA chính nằm cuối). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-gutter-lg xl:flex-row xl:items-center xl:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-space-xs">
        {eyebrow ? (
          <div className="flex flex-wrap items-center gap-space-sm font-label-sm uppercase tracking-widest text-outline">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-headline-lg text-on-surface">{title}</h1>
        {description ? (
          <p className="max-w-3xl text-body-md text-on-surface-variant">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-space-sm">{actions}</div>
      ) : null}
    </header>
  );
}
