"use client";

import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { useEffect, useState, type ReactNode } from "react";

/**
 * AppShell — layout `pl-72` + `pt-16`.
 *
 * Dưới 1024px sidebar thu gọn thành drawer (task 3.8): grid 12 cột chuyển 1 cột
 * và sidebar trượt ra khi bấm nút menu.
 */
export function AppShell({
  children,
  streak,
  weekEnergy,
  aiChip,
  aiIsLocal,
}: {
  children: ReactNode;
  streak: number;
  weekEnergy: number;
  aiChip: string;
  aiIsLocal: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Cmd/Ctrl+K mở Quick-log — handler đặt ở shell để hoạt động trên mọi route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("quicklog:open"));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={!drawerOpen} onNavigate={() => setDrawerOpen(false)} />

      {/* Nút mở drawer — chỉ hiện dưới 1024px */}
      <button
        type="button"
        onClick={() => setDrawerOpen((v) => !v)}
        className="fixed left-gutter top-4 z-[60] flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-high text-on-surface lg:hidden"
        aria-label={drawerOpen ? "Đóng menu" : "Mở menu"}
        aria-expanded={drawerOpen}
      >
        <span className="material-symbols-outlined" aria-hidden>
          {drawerOpen ? "close" : "menu"}
        </span>
      </button>

      <div className="lg:pl-72">
        <Topbar
          streak={streak}
          weekEnergy={weekEnergy}
          aiChip={aiChip}
          aiIsLocal={aiIsLocal}
        />
        <main className="w-full bg-surface pt-16 min-h-screen">
          <div className="mx-auto w-full max-w-[1600px] space-y-gutter-lg p-margin-lg">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
