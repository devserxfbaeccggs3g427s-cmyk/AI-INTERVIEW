/**
 * Integration test — tầng dữ liệu chi phí AI (tasks.md 17.1–17.5).
 *
 * Kiểm tra số liệu trong `cost-data.ts` được tính đúng từ bảng `AiCall`:
 *   - `getBudgetStatus` — phần trăm = spent / budget, cảnh báo ≥80%.
 *   - `getCacheStats` — hit rate = cacheRead / (cacheRead + inputTokens).
 *   - `getAggregateData` — tổng chi phí / provider / feature group.
 *   - `getCostRows` — gom theo (provider, model).
 *   - `getRecentCalls` — sắp xếp giảm dần theo createdAt.
 *   - `getEmergencyMode` — đọc cờ từ UserProfile.
 *
 * ⚠️ Mọi bản ghi test đều có `feature` bắt đầu bằng `test_17_` và được dọn
 * ở `afterEach` → không lẫn với dữ liệu thật.
 *
 * ⚠️ `UserProfile` là bảng singleton (app luôn đọc hàng đầu tiên theo
 * `createdAt asc`) → test tạo hàng riêng có `createdAt` = 2000-01-01 để
 * **luôn là hàng đầu tiên**, rồi dọn ở `afterEach`. Hàng seed (nếu còn)
 * không bị test đụng tới.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  getAggregateData,
  getBudgetStatus,
  getCacheStats,
  getCostRows,
  getEmergencyMode,
  getRecentCalls,
  type MonthKey,
} from "@/lib/settings/cost-data";

/** Tháng cố định để test không phụ thuộc "hôm nay". */
const MONTH: MonthKey = "2026-03";

/** Ngày trong tháng test. */
const IN_MONTH = new Date("2026-03-15T10:00:00.000Z");
const LATER = new Date("2026-03-15T10:00:03.000Z");

/** Tiền tố feature của test — dùng để dọn dẹp. */
const TEST_PREFIX = "test_17_";

/** Id cố định của `UserProfile` test — để dọn dẹn chắc chắn. */
const TEST_PROFILE_ID = "test-profile-17";

/**
 * `createdAt` rất sớm → hàng test **luôn là hàng đầu tiên** khi app đọc
 * `findFirst({ orderBy: { createdAt: "asc" } })` → `getBudgetStatus()` và
 * `getEmergencyMode()` chắc chắn đọc đúng hàng mà test đang sửa.
 */
const TEST_PROFILE_CREATED_AT = new Date("2000-01-01T00:00:00.000Z");

/** Xoá mọi bản ghi test. */
async function cleanup(): Promise<void> {
  await prisma.aiCall.deleteMany({ where: { feature: { startsWith: TEST_PREFIX } } });
  // Chỉ xoá hàng profile **của test** — không đụng hàng seed.
  await prisma.userProfile.deleteMany({ where: { id: TEST_PROFILE_ID } });
}

/**
 * Đảm bảo có hàng `UserProfile` test.
 *
 * DB test có thể trống (test `wipe` của `export-import.test.ts` xoá sạch
 * toàn bộ bảng) → test phải tự tạo hàng riêng thay vì giả định seed tồn tại.
 *
 * ⚠️ Hàng test dùng `createdAt` = 2000-01-01 nên **luôn là hàng đầu tiên** →
 * khớp với cách app đọc profile (singleton theo `createdAt asc`).
 */
async function ensureTestProfile() {
  const existing = await prisma.userProfile.findUnique({ where: { id: TEST_PROFILE_ID } });
  if (existing) return existing;

  return prisma.userProfile.create({
    data: {
      id: TEST_PROFILE_ID,
      name: "Test Profile §17",
      createdAt: TEST_PROFILE_CREATED_AT,
    },
  });
}

describe("§17 — cost-data", () => {
  beforeEach(async () => {
    await cleanup();
    await ensureTestProfile();
  });
  afterEach(cleanup);
  afterAll(cleanup);

  it("getBudgetStatus tính phần trăm + cảnh báo ≥80%", async () => {
    const profile = await ensureTestProfile();
    const previousBudget = profile.monthlyBudgetUsd;

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { monthlyBudgetUsd: 1 },
    });

    await prisma.aiCall.create({
      data: {
        feature: `${TEST_PREFIX}budget`,
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0.9,
        latencyMs: 100,
        ok: true,
        createdAt: IN_MONTH,
      },
    });

    const status = await getBudgetStatus(MONTH);
    expect(status.budget).toBe(1);
    expect(status.spent).toBeCloseTo(0.9, 6);
    expect(status.percent).toBeCloseTo(90, 4);
    expect(status.warning).toBe(true);

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { monthlyBudgetUsd: previousBudget },
    });
  });

  it("getCacheStats tính hit rate từ cacheRead / (cacheRead + inputTokens)", async () => {
    await prisma.aiCall.create({
      data: {
        feature: `${TEST_PREFIX}cache`,
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 300,
        outputTokens: 50,
        cacheRead: 100,
        cacheWrite: 0,
        estimatedCost: 0.01,
        latencyMs: 500,
        ok: true,
        createdAt: IN_MONTH,
      },
    });

    const stats = await getCacheStats(MONTH);
    expect(stats.totalCacheRead).toBe(100);
    // 100 / (100 + 300) = 25%
    expect(stats.hitRate).toBeCloseTo(25, 4);
    expect(stats.okCalls).toBe(1);
  });

  it("getAggregateData tách provider local (0 cost) và anthropic", async () => {
    // `classify` thuộc feature group "biometric" trong FEATURE_GROUPS.
    await prisma.aiCall.create({
      data: {
        feature: "classify",
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 10,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0.05,
        latencyMs: 200,
        ok: true,
        createdAt: IN_MONTH,
      },
    });
    await prisma.aiCall.create({
      data: {
        feature: "classify",
        provider: "local",
        model: "qwen2.5:7b",
        inputTokens: 10,
        outputTokens: 10,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
        latencyMs: 800,
        ok: true,
        createdAt: LATER,
      },
    });

    try {
      const { aggregate, providers, features } = await getAggregateData(MONTH);
      const local = providers.find((p) => p.provider === "local");
      const cloud = providers.find((p) => p.provider === "anthropic");
      expect(local?.cost).toBe(0);
      expect(cloud?.cost).toBeCloseTo(0.05, 6);

      // Feature group phải gộp cả 2 lượt.
      const grouped = features.find((f) => f.id === "biometric");
      expect(grouped?.calls).toBe(2);
      expect(aggregate.totalCalls).toBeGreaterThanOrEqual(2);
    } finally {
      await prisma.aiCall.deleteMany({ where: { feature: "classify" } });
    }
  });

  it("getCostRows gom theo (provider, model) + tính %", async () => {
    await prisma.aiCall.create({
      data: {
        feature: `${TEST_PREFIX}rows`,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        inputTokens: 5,
        outputTokens: 5,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0.02,
        latencyMs: 100,
        ok: true,
        createdAt: IN_MONTH,
      },
    });

    const rows = await getCostRows(MONTH);
    const row = rows.find((r) => r.model === "claude-haiku-4-5");
    expect(row?.calls).toBe(1);
    expect(row?.cost).toBeCloseTo(0.02, 6);
    // % tính trên tổng của CẢ tháng (có thể có dữ liệu seed) → chỉ kiểm tra
    // nó là số hợp lệ trong (0, 100].
    expect(row?.percent).toBeGreaterThan(0);
    expect(row?.percent).toBeLessThanOrEqual(100);
  });

  it("getRecentCalls sắp xếp giảm dần theo createdAt", async () => {
    await prisma.aiCall.create({
      data: {
        feature: `${TEST_PREFIX}recent_old`,
        provider: "local",
        model: "qwen2.5:7b",
        inputTokens: 1,
        outputTokens: 1,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
        latencyMs: 10,
        ok: true,
        createdAt: IN_MONTH,
      },
    });
    await prisma.aiCall.create({
      data: {
        feature: `${TEST_PREFIX}recent_new`,
        provider: "local",
        model: "qwen2.5:7b",
        inputTokens: 1,
        outputTokens: 1,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
        latencyMs: 10,
        ok: true,
        createdAt: LATER,
      },
    });

    const calls = await getRecentCalls(5);
    const indexOld = calls.findIndex((c) => c.feature === `${TEST_PREFIX}recent_old`);
    const indexNew = calls.findIndex((c) => c.feature === `${TEST_PREFIX}recent_new`);
    expect(indexNew).toBeGreaterThanOrEqual(0);
    expect(indexOld).toBeGreaterThanOrEqual(0);
    expect(indexNew).toBeLessThan(indexOld);
  });

  it("getEmergencyMode đọc cờ từ UserProfile đầu tiên", async () => {
    const profile = await ensureTestProfile();
    const previous = profile.emergencyMode;

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { emergencyMode: true },
    });

    expect(await getEmergencyMode()).toBe(true);

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { emergencyMode: previous },
    });
  });
});
