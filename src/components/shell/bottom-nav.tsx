"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Đúng 4 mục theo SPEC §3.1 — không thêm, không bớt.
 * Vùng ngón cái: `min-h-14` mỗi mục (NFR-01).
 */
const NAV_ITEMS = [
  { href: "/", label: "Hôm nay", icon: "today" },
  { href: "/skills", label: "Kỹ năng", icon: "account_tree" },
  { href: "/language", label: "Ôn tập", icon: "style" },
  { href: "/journal", label: "Nhật ký", icon: "edit_note" },
] as const;

export interface BottomNavProps {
  pathname: string;
}

export function BottomNav({ pathname }: BottomNavProps) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/40 bg-surface-container/95 pb-safe backdrop-blur-md"
    >
      <ul className="mx-auto grid max-w-[1520px] grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 py-2",
                  "font-label-sm text-label-sm tracking-wide transition-colors",
                  "focus-visible:outline-none",
                  active ? "text-primary" : "text-outline hover:text-on-surface",
                )}
              >
                <Icon name={item.icon} size={22} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
