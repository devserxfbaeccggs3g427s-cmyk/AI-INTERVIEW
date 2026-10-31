"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Tab cho trang Cài đặt (S15).
 *
 * ⚠️ Vì sao dùng tab thay vì 1 trang dài: FR-SC-07 yêu cầu phản hồi rõ ràng
 * khi lưu; tách tab giúp mỗi nhóm hành động có 1 nút lưu rõ ràng.
 */
export interface SettingsTabsProps {
  profile: React.ReactNode;
  apiKey: React.ReactNode;
  costs: React.ReactNode;
  data: React.ReactNode;
}

const TABS = [
  { id: "profile", label: "Hồ sơ" },
  { id: "apiKey", label: "API key" },
  { id: "costs", label: "Chi phí AI" },
  { id: "data", label: "Dữ liệu" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsTabs({ profile, apiKey, costs, data }: SettingsTabsProps) {
  const [tab, setTab] = useState<TabId>("profile");

  return (
    <div className="space-y-gutter-md">
      <div
        role="tablist"
        aria-label="Nhóm cài đặt"
        className="flex flex-wrap gap-1 border-b border-outline-variant pb-space-xs"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-t-lg px-3 py-2 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              tab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-w-0"
      >
        {tab === "profile" && profile}
        {tab === "apiKey" && apiKey}
        {tab === "costs" && costs}
        {tab === "data" && data}
      </div>
    </div>
  );
}
