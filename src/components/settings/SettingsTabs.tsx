"use client";

/**
 * S15 — Bộ 4 tab của trang Cài đặt (task 9.1).
 *
 * Tab 3 (Chi phí AI) và Tab 4 (Quản trị dữ liệu) hiển thị số liệu thật từ DB —
 * KHÔNG hardcode con số mockup (design.md §4.15).
 */

import { ProfileTab, type ProfileSaveState, type ProfileValues } from "@/components/settings/ProfileTab";
import { ApiKeyTab } from "@/components/settings/ApiKeyTab";
import { CostTab } from "@/components/settings/CostTab";
import { DataTab } from "@/components/settings/DataTab";
import type { TableData } from "@/lib/settings/cost-data";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Chip";
import { TabPanel, Tabs, type TabItem } from "@/components/ui/Tabs";
import { useState } from "react";

const TABS: TabItem[] = [
  { id: "profile", label: "Hồ sơ & Mục tiêu", icon: "person" },
  { id: "api-key", label: "Khóa API Anthropic & Kết nối", icon: "key" },
  {
    id: "cost",
    label: "Chi Phí AI & Prompt Caching",
    icon: "database",
    badge: <Badge tone="tertiary">TỐI ƯU</Badge>,
  },
  { id: "data", label: "Quản trị dữ liệu (Backup / Export JSON)", icon: "storage" },
];

export function SettingsTabs({
  profile,
  keyConfigured,
  keyMasked,
  saveProfileAction,
  dataPromise,
  tableCountsPromise,
  routeOverrides,
}: {
  /** Hồ sơ hiện tại — server đọc từ `UserProfile`. */
  profile: ProfileValues;
  /** Server đã kiểm tra `.env.local` — key có tồn tại hay không. */
  keyConfigured: boolean;
  /** Key đã che (hoặc `null`). */
  keyMasked: string | null;
  saveProfileAction: (
    prev: ProfileSaveState,
    formData: FormData,
  ) => Promise<ProfileSaveState>;
  /** Promise dữ liệu chi phí tháng (task 17.5). */
  dataPromise: Promise<TableData>;
  /** Promise số bản ghi mừi bảng (task 17.8). */
  tableCountsPromise: Promise<Record<string, number>>;
  /** Ghi đè model local — server đọc từ bảng `RouteOverride` (task 17.10). */
  routeOverrides: Array<{ task: string; model: string }>;
}) {
  const [active, setActive] = useState("profile");

  return (
    <div className="space-y-gutter">
      <Tabs items={TABS} active={active} onChange={setActive} label="Cài đặt hệ thống" />

      {/* ── Tab 1 ───────────────────────────────────────────────────────── */}
      <TabPanel id="profile" active={active}>
        <ProfileTab initial={profile} saveAction={saveProfileAction} />
      </TabPanel>

      {/* ── Tab 2 ───────────────────────────────────────────────────────── */}
      <TabPanel id="api-key" active={active}>
        <ApiKeyTab initialConfigured={keyConfigured} initialMasked={keyMasked} />
      </TabPanel>

      {/* ── Tab 3 (Phase 1) ─────────────────────────────────────────────── */}
      <TabPanel id="cost" active={active}>
        <CostTab dataPromise={dataPromise} routeOverrides={routeOverrides} />
      </TabPanel>

      {/* ── Tab 4 (Phase 1) ─────────────────────────────────────────────── */}
      <TabPanel id="data" active={active}>
        <DataTab tableCountsPromise={tableCountsPromise} />
      </TabPanel>
    </div>
  );
}
