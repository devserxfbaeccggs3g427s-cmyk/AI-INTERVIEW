"use client";

/**
 * S15 — Bộ 4 tab của trang Cài đặt (task 9.1).
 *
 * Tab 1 (Hồ sơ & Mục tiêu) và Tab 2 (Khóa API) là **bắt buộc** ở Phase 0.
 * Tab 3 (Chi phí AI) và Tab 4 (Quản trị dữ liệu) ở Phase 0 chỉ là placeholder
 * rõ ràng "Sẽ dựng ở Phase 1" — KHÔNG hardcode bất kỳ con số mockup nào
 * (design.md §4.15 cảnh báo các số liệu tab 3/4 là giá trị mockup).
 *
 * Xem tasks.md 9.1 · design.md §4.15.
 */

import { ProfileTab, type ProfileSaveState, type ProfileValues } from "@/components/settings/ProfileTab";
import { ApiKeyTab } from "@/components/settings/ApiKeyTab";
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

      {/* ── Tab 3 — placeholder Phase 1 ────────────────────────────────── */}
      <TabPanel id="cost" active={active}>
        <Card tone="low">
          <CardHeader
            title="Chi Phí AI & Prompt Caching"
            subtitle="Sẽ dựng ở Phase 1"
            icon="database"
            action={<Badge tone="outline">Phase 1</Badge>}
          />
          <p className="text-body-md text-on-surface-variant">
            Ngân sách tháng, cache hit rate và nhật ký gọi API sẽ được tính trực tiếp từ bảng{" "}
            <code className="font-code-md text-primary">AiCall</code>. Ở Phase 0 chưa dựng để tránh
            hiển thị con số không có nguồn gốc thật.
          </p>
        </Card>
      </TabPanel>

      {/* ── Tab 4 — placeholder Phase 1 ────────────────────────────────── */}
      <TabPanel id="data" active={active}>
        <Card tone="low">
          <CardHeader
            title="Quản trị dữ liệu (Backup / Export JSON)"
            subtitle="Sẽ dựng ở Phase 1"
            icon="storage"
            action={<Badge tone="outline">Phase 1</Badge>}
          />
          <p className="text-body-md text-on-surface-variant">
            Xuất / nhập toàn bộ cơ sở dữ liệu JSON và thống kê số bản ghi mỗi bảng sẽ dựng ở Phase 1.
          </p>
        </Card>
      </TabPanel>
    </div>
  );
}
