// `cn` import từ `@/lib/cn` (module KHÔNG có "use client") để `Breadcrumb` là
// Server Component an toàn — Server Component KHÔNG gọi được hàm export từ
// module client (`@/components/ui/Button`).
import { cn } from "@/lib/cn";
import Link from "next/link";

/**
 * Breadcrumb 4 cấp — dùng cho S04 (`/skills/[id]`).
 *
 * Cấp cuối là trang hiện tại nên không render thành link.
 *
 * Xem design.md §4.4 (breadcrumb 4 cấp) · tasks.md 7.7.
 */
export type BreadcrumbItem = {
  label: string;
  /** Bỏ trống → phần tử cuối, hiển thị dạng text chứ không phải link. */
  href?: string;
};

export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-space-xs font-label-md text-on-surface-variant">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-space-xs">
              {index > 0 ? (
                <span className="material-symbols-outlined text-outline" style={{ fontSize: "1rem" }} aria-hidden>
                  chevron_right
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-on-surface hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-on-surface" aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
