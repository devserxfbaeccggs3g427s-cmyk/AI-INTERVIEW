"use client";

import { cn } from "@/components/ui/Button";
import { activeNavItem, type NavItem } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav item của sidebar.
 *
 * Trạng thái active do `usePathname()` quyết định — KHÔNG dùng `data-path`
 * (design.md §9.4 mục 4: 20/21 màn hình mockup thiếu active state).
 *
 * Dùng `activeNavItem()` (alias-aware) thay vì `isNavActive()` thuần: 7 route
 * trong 21 màn hình không nằm trực tiếp dưới `href` của mục nav nào
 * (`/plan`, `/log`, `/state`, `/progress`, `/speak/talk`, `/interview/session`
 * …) → cần bảng alias để luôn có đúng **1** mục active. Xem `lib/nav.ts`.
 */
export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname)?.href === item.href;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      className={cn(
        "flex items-center gap-space-md rounded-lg px-space-md py-2.5 transition-colors",
        "font-body-md text-on-surface-variant",
        "hover:bg-surface-container hover:text-on-surface",
        active &&
          "bg-surface-container-high font-semibold text-primary shadow-inner border border-outline-variant/40",
      )}
    >
      <span
        className={cn(
          "material-symbols-outlined shrink-0",
          active ? "text-primary" : "text-outline",
        )}
        aria-hidden
      >
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
