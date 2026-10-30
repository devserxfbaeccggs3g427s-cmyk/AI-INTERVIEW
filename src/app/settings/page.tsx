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
import { getCostData, type TableData, type CostByProvider, type MonthKey } from "@/lib/settings/cost-data";
import type { ProfileValues } from "@/lib/settings-types";

/**
 * Tổng số bản ghi của các bảng chính — dùng cho chip trạng thái.
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

/**
 * Đếm số bản ghi của từng bảng — dùng cho tab Quản trị dữ liệu (task 17.8).
 */
async function countTableRecords(): Promise<Record<string, number>> {
  const [
    skill, activity, evidence, reflection, planItem, focusTarget,
    dailyState, card, review, userProfile, weeklyReviewRun,
    routeOverride, aiCall, interviewProfile, interviewSession,
    interviewTurn, testSession, testItem,
  ] = await Promise.all([
    prisma.skill.count(),
    prisma.activity.count(),
    prisma.evidence.count(),
    prisma.reflection.count(),
    prisma.planItem.count(),
    prisma.focusTarget.count(),
    prisma.dailyState.count(),
    prisma.card.count(),
    prisma.review.count(),
    prisma.userProfile.count(),
    prisma.weeklyReviewRun.count(),
    prisma.routeOverride.count(),
    prisma.aiCall.count(),
    prisma.interviewProfile.count(),
    prisma.interviewSession.count(),
    prisma.interviewTurn.count(),
    prisma.testSession.count(),
    prisma.testItem.count(),
  ]);
  return {
    skill, activity, evidence, reflection, planItem, focusTarget,
    dailyState, card, review, userProfile, weeklyReviewRun,
    routeOverride, aiCall, interviewProfile, interviewSession,
    interviewTurn, testSession, testItem,
  };
}

/** Tính monthKey cho tháng hiện tại — dạng `YYYY-MM`. */
function currentMonthKey(): MonthKey {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${year}-${month}` as MonthKey;
}

export default async function SettingsPage() {
  const monthKey = currentMonthKey();
  const dataPromise = getCostData(monthKey);
  const tableCountsPromise = countTableRecords();

  const [profileRow, records, data, routeOverrides] = await Promise.all([
    prisma.userProfile.findFirst({ orderBy: { createdAt: "asc" } }),
    countRecords(),
    dataPromise,
    prisma.routeOverride.findMany({
      select: { task: true, model: true },
      orderBy: { task: "asc" },
    }),
  ]);

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
        dataPromise={dataPromise}
        tableCountsPromise={tableCountsPromise}
        routeOverrides={routeOverrides}
      />
    </div>
  );
}
