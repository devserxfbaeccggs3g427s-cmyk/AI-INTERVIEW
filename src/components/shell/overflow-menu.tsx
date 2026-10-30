"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";

/**
 * Đúng 5 mục theo thứ tự SPEC §3.1 — không thêm, không bớt.
 */
const MENU_ITEMS = [
  { href: "/review", label: "Báo cáo tuần" },
  { href: "/progress", label: "Báo cáo tiến bộ" },
  { href: "/interview/setup", label: "Mock Interview" },
  { href: "/test", label: "Bài kiểm tra" },
  { href: "/settings", label: "Cài đặt" },
] as const;

export function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Đóng khi click ra ngoài hoặc nhấn Escape — focus quay về nút trigger.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Mở menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-2 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="more_vert" size={22} />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Menu điều hướng phụ"
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-high shadow-md"
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-space-md py-space-sm font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:bg-surface-container-highest focus-visible:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
