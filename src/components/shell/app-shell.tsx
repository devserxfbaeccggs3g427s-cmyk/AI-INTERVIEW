"use client";

import { usePathname } from "next/navigation";

import { BottomNav } from "@/components/shell/bottom-nav";
import { OverflowMenu } from "@/components/shell/overflow-menu";

export interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Khung ứng dụng — 3 trục theo design-system §4:
 *   1. Header (top strip)
 *   2. Main content module
 *   3. Persistent action rail (bottom nav)
 *
 * Client Component vì bottom nav + menu cần `usePathname()` để đánh dấu active.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/40 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1520px] items-center justify-between px-margin">
          <span className="font-headline-sm text-headline-sm text-on-surface">
            Daily Loop OS
          </span>
          <OverflowMenu />
        </div>
      </header>

      {/* pb-24 chừa chỗ cho bottom nav cố định (không che nội dung). */}
      <main className="mx-auto max-w-[1520px] space-y-gutter-lg p-margin-lg pb-24">{children}</main>

      <BottomNav pathname={pathname} />
    </div>
  );
}
