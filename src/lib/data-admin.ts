import { stat } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

/**
 * Quản trị dữ liệu (FR-SC-24..26).
 *
 * ⚠️ FR-SC-25 — xoá trắng trong **1 transaction** với timeout 20s: nếu lỗi
 * giữa chừng ⇒ rollback, dữ liệu còn nguyên vẹn.
 *
 * ⚠️ Hồ sơ (`UserProfile`) **không** bị xoá — chỉ reset về mặc định.
 */

/** 14 bảng nghiệp vụ được xuất (không gồm `UserProfile` — riêng). */
export const EXPORTABLE_TABLES = [
  "activities",
  "evidences",
  "skills",
  "cards",
  "planItems",
  "reflections",
  "dailyStates",
  "aiCalls",
  "interviewSessions",
  "testSessions",
  "reviews",
  "srsReviews",
  "speakAttempts",
  "upcomingGoals",
] as const;

/**
 * Đường dẫn file SQLite — suy ra từ `DATABASE_URL`.
 */
export function dbFilePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "";

  const match = /^file:(.+)$/.exec(url);
  if (!match) return "";

  const raw = match[1];
  return raw.startsWith("/") ? raw : path.join(process.cwd(), "prisma", raw);
}

/**
 * Thống kê DB (FR-SC-26): dung lượng file + số bản ghi từng bảng.
 */
export async function getDbStats(): Promise<{
  dbSizeBytes: number;
  dbPath: string;
  recordCounts: Record<string, number>;
}> {
  const dbPath = dbFilePath();

  let dbSizeBytes = 0;
  if (dbPath) {
    try {
      dbSizeBytes = (await stat(dbPath)).size;
    } catch {
      dbSizeBytes = 0;
    }
  }

  const [
    activities,
    evidences,
    skills,
    cards,
    planItems,
    reflections,
    dailyStates,
    aiCalls,
    interviewSessions,
    testSessions,
    reviews,
    profiles,
  ] = await Promise.all([
    prisma.activity.count(),
    prisma.evidence.count(),
    prisma.skill.count(),
    prisma.card.count(),
    prisma.planItem.count(),
    prisma.reflection.count(),
    prisma.dailyState.count(),
    prisma.aiCall.count(),
    prisma.interviewSession.count(),
    prisma.testSession.count(),
    prisma.review.count(),
    prisma.userProfile.count(),
  ]);

  return {
    dbSizeBytes,
    dbPath,
    recordCounts: {
      Activity: activities,
      Evidence: evidences,
      Skill: skills,
      Card: cards,
      PlanItem: planItems,
      Reflection: reflections,
      DailyState: dailyStates,
      AiCall: aiCalls,
      InterviewSession: interviewSessions,
      TestSession: testSessions,
      Review: reviews,
      UserProfile: profiles,
    },
  };
}

/**
 * Xoá toàn bộ dữ liệu người dùng (FR-SC-25).
 *
 * ⚠️ Thứ tự con trước cha. `Skill` + `Card` được **giữ** (seed lõi — cây kỹ
 * năng và bộ thẻ gốc). `UserProfile` được reset về mặc định, không xoá.
 *
 * ⚠️ Transaction timeout 20s — nếu lỗi ⇒ rollback, dữ liệu nguyên vẹn.
 */
export async function wipeAllData(): Promise<{
  deleted: Record<string, number>;
  dbSizeBytesBefore: number;
  dbSizeBytesAfter: number;
}> {
  const before = await getDbStats();

  const deleted = await prisma.$transaction(
    async (tx) => {
      // Con trước cha.
      const evidences = await tx.evidence.deleteMany();
      const aiCalls = await tx.aiCall.deleteMany();
      const reflections = await tx.reflection.deleteMany();
      const activities = await tx.activity.deleteMany();
      const planItems = await tx.planItem.deleteMany();
      const dailyStates = await tx.dailyState.deleteMany();

      // ⚠️ Reset hồ sơ về mặc định — KHÔNG xoá dòng hồ sơ.
      await tx.userProfile.updateMany({
        data: {
          name: null,
          goals: null,
          aiTone: "direct",
          learningLangs: "zh,en",
          zhLevel: "zero",
          enLevel: "zero",
          viLevel: "B2",
          languageStandard: "cefr",
          interviewLang: "en",
          monthlyBudgetUsd: 15,
          saverMode: false,
          focusSkillId: null,
        },
      });

      return {
        Evidence: evidences.count,
        AiCall: aiCalls.count,
        Reflection: reflections.count,
        Activity: activities.count,
        PlanItem: planItems.count,
        DailyState: dailyStates.count,
      };
    },
    { timeout: 20_000 },
  );

  const after = await getDbStats();

  return {
    deleted,
    dbSizeBytesBefore: before.dbSizeBytes,
    dbSizeBytesAfter: after.dbSizeBytes,
  };
}

/**
 * Xuất toàn bộ DB (FR-SC-24).
 *
 * ⚠️ Shape: `{ schemaVersion, exportedAt, app, profile, tables }`.
 */
export async function exportAllData(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  app: { name: string; version: string };
  profile: unknown;
  tables: Record<string, unknown[]>;
}> {
  const [
    activities,
    evidences,
    skills,
    cards,
    planItems,
    reflections,
    dailyStates,
    aiCalls,
    interviewSessions,
    testSessions,
    reviews,
    profiles,
  ] = await Promise.all([
    prisma.activity.findMany(),
    prisma.evidence.findMany(),
    prisma.skill.findMany(),
    prisma.card.findMany(),
    prisma.planItem.findMany(),
    prisma.reflection.findMany(),
    prisma.dailyState.findMany(),
    prisma.aiCall.findMany(),
    prisma.interviewSession.findMany(),
    prisma.testSession.findMany(),
    prisma.review.findMany(),
    prisma.userProfile.findMany(),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: { name: "daily-loop-os", version: "0.1.0" },
    profile: profiles,
    tables: {
      activities,
      evidences,
      skills,
      cards,
      planItems,
      reflections,
      dailyStates,
      aiCalls,
      interviewSessions,
      testSessions,
      reviews,
      // Các bảng chưa có model riêng — trả mảng rỗng để shape ổn định.
      srsReviews: [],
      speakAttempts: [],
      upcomingGoals: [],
    },
  };
}
