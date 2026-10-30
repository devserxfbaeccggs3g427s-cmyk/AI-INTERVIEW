"use client";

import { NavLink } from "@/components/shell/NavLink";
import { cn } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/Chip";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * Sidebar 288px (`w-72`).
 *
 * Đối chiếu 21/21 màn hình Stitch: `<aside>` dùng `bg-surface-container-lowest`,
 * dải logo bên trong `bg-surface-container-low/60`, dải footer `bg-surface-container-low/50`.
 *
 * Dưới 1024px sidebar thu gọn thành drawer (task 3.8) — `collapsed` do AppShell
 * truyền xuống.
 */
export function Sidebar({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-outline-variant/30",
        "bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.25)]",
        "transition-transform duration-200",
        collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
      )}
      aria-label="Điều hướng chính"
    >
      {/* Dải logo */}
      <div className="flex items-center gap-space-md bg-surface-container-low/60 px-gutter py-gutter">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-container">
          <span className="material-symbols-outlined text-on-primary" aria-hidden>
            loop
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-headline-sm text-on-surface">Daily Loop OS</div>
        </div>
        <span className="shrink-0 rounded-sm bg-surface-container-highest px-1.5 py-0.5 font-label-sm text-outline">
          Local-First v1.1
        </span>
      </div>

      {/* Danh sách nav */}
      <nav className="flex-1 overflow-y-auto px-space-md py-gutter">
        <p className="mb-space-md px-space-md font-label-sm uppercase tracking-widest text-outline">
          Phân hệ tác vụ
        </p>
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} />
            </li>
          ))}
        </ul>
      </nav>

      {/* Dải trạng thái DB */}
      <div className="bg-surface-container-low/50 border-t border-outline-variant/30 p-gutter">
        <div className="flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <StatusDot tone="primary" pulse />
            <div className="min-w-0">
              <div className="truncate font-label-md text-on-surface">SQLite / Vector</div>
              <div className="truncate font-label-sm text-outline">Local DB Active</div>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline" aria-hidden>
            database
          </span>
        </div>
      </div>
    </aside>
  );
}
