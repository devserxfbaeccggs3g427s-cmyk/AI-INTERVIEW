/**
 * Integration test — các route cài đặt của S15 (tasks.md 17.1 · 17.6 · 17.10).
 *
 * Test trên **DB test** (`prisma/test.db` — cô lập qua `vitest.config.ts`),
 * nên có thể xoá/sửa thoải mái mà không đụng DB thật của người dùng.
 *
 * Cover:
 *   - `POST /api/settings/budget` — đặt / bỏ ngân sách tháng (17.1).
 *   - `POST /api/settings/emergency` — bật/tắt chế độ khẩn cấp (17.6).
 *   - `POST /api/settings/route-override` — ghi đè model local (17.10).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { resetEmergencyModeCache } from "@/lib/ai/router";

/** Id cố định của `UserProfile` test — để dọn dẹn chắc chắn. */
const TEST_PROFILE_ID = "test-profile-settings";

/** Task hợp lệ cho `route-override` (thuộc `LOCAL_TASK_IDS`). */
const VALID_TASK = "classify";

async function cleanup(): Promise<void> {
  await prisma.userProfile.deleteMany({ where: { id: TEST_PROFILE_ID } });
  await prisma.routeOverride.deleteMany({ where: { task: "test_invalid_task" } });
  resetEmergencyModeCache();
}

/** Gọi route handler trực tiếp (không qua HTTP server). */
async function callRoute(
  modulePath: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const mod = (await import(modulePath)) as { POST: (req: Request) => Promise<Response> };
  const res = await mod.POST(
    new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("§17 — route cài đặt (budget / emergency / route-override)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("POST /api/settings/budget lưu ngân sách vào UserProfile", async () => {
    const { status, body } = await callRoute("@/app/api/settings/budget/route", {
      monthlyBudgetUsd: 12.5,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.monthlyBudgetUsd).toBeCloseTo(12.5, 6);

    const profile = await prisma.userProfile.findFirst({
      orderBy: { createdAt: "asc" },
      select: { monthlyBudgetUsd: true },
    });
    expect(profile?.monthlyBudgetUsd).toBeCloseTo(12.5, 6);
  });

  it("POST /api/settings/budget bỏ ngân sách khi gửi `null`", async () => {
    await prisma.userProfile.create({
      data: { id: TEST_PROFILE_ID, monthlyBudgetUsd: 5 },
    });

    const { status, body } = await callRoute("@/app/api/settings/budget/route", {
      monthlyBudgetUsd: null,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.monthlyBudgetUsd).toBeNull();
  });

  it("POST /api/settings/budget từ chối giá trị âm (400)", async () => {
    const { status, body } = await callRoute("@/app/api/settings/budget/route", {
      monthlyBudgetUsd: -1,
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("validation");
  });

  it("POST /api/settings/emergency bật/tắt cờ emergencyMode", async () => {
    await prisma.userProfile.create({
      data: { id: TEST_PROFILE_ID, emergencyMode: false },
    });

    const on = await callRoute("@/app/api/settings/emergency/route", { emergencyMode: true });
    expect(on.status).toBe(200);
    expect(on.body.ok).toBe(true);
    expect(on.body.data.emergencyMode).toBe(true);

    const off = await callRoute("@/app/api/settings/emergency/route", { emergencyMode: false });
    expect(off.body.data.emergencyMode).toBe(false);
  });

  it("POST /api/settings/emergency từ chối body không phải boolean (400)", async () => {
    const { status, body } = await callRoute("@/app/api/settings/emergency/route", {
      emergencyMode: "yes",
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("validation");
  });

  it("POST /api/settings/route-override ghi đè model cho task local", async () => {
    const { status, body } = await callRoute("@/app/api/settings/route-override/route", {
      task: VALID_TASK,
      model: "qwen2.5:7b",
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const override = await prisma.routeOverride.findUnique({ where: { task: VALID_TASK } });
    expect(override?.model).toBe("qwen2.5:7b");

    await prisma.routeOverride.deleteMany({ where: { task: VALID_TASK } });
  });

  it("POST /api/settings/route-override từ chối task không hợp lệ (400)", async () => {
    const { status, body } = await callRoute("@/app/api/settings/route-override/route", {
      task: "test_invalid_task",
      model: "qwen2.5:7b",
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
