/**
 * S15 — Cài đặt `/settings` (tasks.md 9.1).
 *
 * Tiêu đề trang: **"Cài Đặt Hệ Thống & Quản Lý Chi Phí AI"** (design.md §4.15).
 * Dải trạng thái hệ thống gồm 3 chip:
 *   `SQLite v3.45 Connected · N records · Không đồng bộ đám mây (P6 Strict Sandboxing)`
 *   · `Prompt Cache Engine: ACTIVE` · `Local Vault: Sealed`
 *
 * ⚠️ Số "records" được đếm **thật** từ DB (không hardcode `1.429` của mockup).
 *
 * Xem design.md §4.15 · requirements.md AC-16.
 */

import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { Chip } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { readEnvLocalKey } from "@/lib/settings-api-key";
import { saveProfile } from "@/lib/settings-profile";
import type { ProfileValues } from "@/lib/settings-types";

/**
 * Tổng số bản ghi của các bảng chính — dùng cho chip trạng thái.
 *
 * Đếm thật từ DB, KHÔNG hardcode con số của mockup (design.md §4.15).
 */
async function countRecords(): Promise<number> {
  const counts = await Promise.all([
    prisma.activity.count(),
    prisma.skill.count(),
    prisma.card.count(),
    prisma.planItem.count(),
    prisma.dailyState.count(),
    prisma.aiCall.count(),
  ]);
  return counts.reduce((sum, value) => sum + value, 0);
}

export default async function SettingsPage() {
  const [profileRow, records] = await Promise.all([
    prisma.userProfile.findFirst({ orderBy: { createdAt: "asc" } }),
    countRecords(),
  ]);

  // Chỉ kiểm tra **sự tồn tại** của key — không đưa giá trị key ra UI.
  const hasKey = readEnvLocalKey() !== null;

  const profile: ProfileValues = {
    name: profileRow?.name ?? "",
    goals: profileRow?.goals ?? "",
    aiTone: profileRow?.aiTone ?? "direct",
    learningLangs: profileRow?.learningLangs ?? "zh,en",
    zhLevel: profileRow?.zhLevel ?? "zero",
    enLevel: profileRow?.enLevel ?? "zero",
  };

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-space-md">
        <span className="font-label-sm uppercase tracking-widest text-outline">
          Daily Loop OS · Hệ thống &amp; cấu hình cục bộ
        </span>
        <h1 className="font-headline-lg text-on-surface">
          Cài Đặt Hệ Thống &amp; Quản Lý Chi Phí AI
        </h1>

        {/* Dải trạng thái hệ thống — 3 chip */}
        <div className="flex flex-wrap gap-space-md">
          <Chip tone="primary" icon="terminal">
            SQLite v3.45 Connected · {records.toLocaleString("vi-VN")} records · Không đồng bộ đám
            mây (P6 Strict Sandboxing)
          </Chip>
          <Chip tone="secondary" icon="memory">
            Prompt Cache Engine: ACTIVE
          </Chip>
          <Chip tone="outline" icon="shield_lock">
            Local Vault: Sealed
          </Chip>
        </div>
      </div>

      <SettingsTabs
        profile={profile}
        keyConfigured={hasKey}
        keyMasked={hasKey ? "sk-ant-••••••••" : null}
        saveProfileAction={saveProfile}
      />
    </div>
  );
}
