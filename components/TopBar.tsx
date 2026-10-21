"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/",         label: "1. Cấu hình AI (BYOK)" },
  { href: "/new",      label: "2. Bắt đầu phỏng vấn" },
  { href: "/session",  label: "3. Phiên đang diễn ra" },
  { href: "/report",   label: "4. Báo cáo đánh giá" },
  { href: "/history",  label: "5. Lịch sử & SQLite" },
];

export function TopBar() {
  const path = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes the mobile menu and hands focus back to the trigger, so the
  // keyboard user is never stranded at the top of the document.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="glass-bar">
      <div className="h-16 w-full px-gutter flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-lg flex-shrink-0">
          <Link href="/" className="flex items-center gap-space-sm">
            <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center text-primary"
                 style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">
                InterviewAI Studio
              </span>
              <span className="label-caps text-tertiary">Engine v2.4 · Local Runtime</span>
            </div>
          </Link>
        </div>

        <nav className="hidden lg:flex items-center gap-space-xs flex-1 justify-center max-w-4xl">
          {NAV.map((item) => {
            const active = path === item.href || (item.href !== "/" && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`nav-link ${active ? "active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-space-md flex-shrink-0">
          <div className="hidden 2xl:flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-surface-container-lowest text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-tertiary">verified_user</span>
            <span className="label-code-sm">BYOK · Key chỉ trong RAM request</span>
          </div>
          <button
            ref={triggerRef}
            type="button"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={menuOpen}
            aria-controls="primary-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden p-space-xs rounded-md hover:bg-surface-elevated"
          >
            <span className="material-symbols-outlined text-[24px]">{menuOpen ? "close" : "menu"}</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center" aria-hidden="true">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="primary-mobile-menu"
          aria-label="Điều hướng chính"
          className="lg:hidden absolute top-full left-0 right-0 z-50 bg-surface-overlay rounded-xl p-space-md flex flex-col gap-space-xs"
          style={{ border: "1px solid var(--border-hairline)" }}
        >
          {NAV.map((item) => {
            const active = path === item.href || (item.href !== "/" && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={`nav-link w-full ${active ? "active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
