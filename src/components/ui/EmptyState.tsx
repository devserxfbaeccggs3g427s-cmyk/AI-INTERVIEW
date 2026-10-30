import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * `EmptyState` — trạng thái rỗng dùng chung.
 *
 * Dùng khi một vùng dữ liệu chưa có nội dung: chưa có kế hoạch hôm nay,
 * chưa có bằng chứng, chưa có thẻ SRS… Pattern lấy từ mockup: icon tròn
 * nền `surface-container-high` + tiêu đề `headline-sm` + mô tả `body-sm` +
 * một CTA duy nhất.
 *
 * **Server-safe**: không có directive, `cn` import từ `@/lib/cn` nên dùng được
 * ở cả Server lẫn Client Component.
 *
 * Xem design.md §3.3 (typography) · tasks.md 3.6.
 */
export type EmptyStateProps = {
  /** Tên Material Symbols Outlined — ví dụ "inbox". */
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  /** CTA chính — render ở dưới mô tả. */
  action?: ReactNode;
  /** Nội dung phụ (link phụ, gợi ý). */
  children?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-space-md rounded-xl border border-outline-variant/30",
        "bg-surface-container-low px-gutter py-margin-lg text-center",
        className,
      )}
      data-testid="empty-state"
    >
      {icon ? (
        <span
          className="flex h-12 w-12 items-center justify-center rounded-[9999px] bg-surface-container-high text-outline"
          aria-hidden
        >
          <span className="material-symbols-outlined" style={{ fontSize: "1.5rem" }}>
            {icon}
          </span>
        </span>
      ) : null}

      <div className="space-y-space-xs">
        <h3 className="font-headline-sm text-on-surface">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-prose text-body-sm text-on-surface-variant">{description}</p>
        ) : null}
      </div>

      {action ? <div className="flex flex-wrap justify-center gap-space-sm">{action}</div> : null}
      {children}
    </div>
  );
}
