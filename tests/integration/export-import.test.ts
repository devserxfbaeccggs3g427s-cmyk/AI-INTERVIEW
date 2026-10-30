/**
 * Integration test — Xuất / Nhập JSON toàn bộ DB (tasks.md 17.7 · 17.8).
 *
 * Test trên **DB thật** (dev.db) nhưng tự dọn rác:
 *   1. Seed vài bản ghi đại diện (Skill, Activity, Card, AiCall…).
 *   2. Gọi `POST /api/export` → parse JSON → kiểm tra có đủ bảng + dữ liệu.
 *   3. Gọi `POST /api/import` với chính file export → kiểm tra dữ liệu khớp.
 *   4. Gọi `POST /api/import` với JSON sai schema → phải bị từ chối (400).
 *   5. Dọn: xoá toàn bộ dữ liệu test đã tạo.
 *
 * ⚠️ Bước 3 (import) **xoá sạch DB** rồi nạp lại — vì vậy test chạy
 * `singleFork` tuần tự (xem vitest.config.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

/** Bảng export — phải khớp với `/api/export` (18 bảng). */
const EXPECTED_TABLES = [
  "skill",
  "activity",
  "evidence",
  "reflection",
  "planItem",
  "focusTarget",
  "dailyState",
  "card",
  "review",
  "userProfile",
  "weeklyReviewRun",
  "routeOverride",
  "aiCall",
  "interviewProfile",
  "interviewSession",
  "interviewTurn",
  "testSession",
  "testItem",
] as const;

/** Id cố định để dọn dẹp chắc chắn. */
const TEST_IDS = {
  skill: "test-skill-17",
  activity: "test-activity-17",
  card: "test-card-17",
  aiCall: "test-aicall-17",
} as const;

/** Gọi route handler `/api/export` trực tiếp (không qua HTTP server). */
async function callExport(): Promise<{ status: number; body: any; headers: Headers }> {
  const { POST } = await import("@/app/api/export/route");
  const res = await POST(new Request("http://localhost/api/export", { method: "POST" }));
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? JSON.parse(text) : null,
  };
}

/** Gọi route handler `/api/import` với JSON thô. */
async function callImport(payload: unknown): Promise<{ status: number; body: any }> {
  const { POST } = await import("@/app/api/import/route");
  const res = await POST(
    new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Gọi route handler `/api/wipe`. */
async function callWipe(): Promise<{ status: number; body: any }> {
  const { POST } = await import("@/app/api/wipe/route");
  const res = await POST(new Request("http://localhost/api/wipe", { method: "POST" }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("§17 — export / import / wipe JSON", () => {
  beforeAll(async () => {
    // Dọn dữ liệu test từ lần chạy trước (nếu có).
    await prisma.aiCall.deleteMany({ where: { id: TEST_IDS.aiCall } });
    await prisma.card.deleteMany({ where: { id: TEST_IDS.card } });
    await prisma.activity.deleteMany({ where: { id: TEST_IDS.activity } });
    await prisma.skill.deleteMany({ where: { id: TEST_IDS.skill } });

    // Seed dữ liệu đại diện.
    await prisma.skill.create({
      data: {
        id: TEST_IDS.skill,
        name: "Test Skill §17",
        domain: "communication",
        level: 2,
        targetLevel: 3,
      },
    });
    await prisma.activity.create({
      data: {
        id: TEST_IDS.activity,
        skillId: TEST_IDS.skill,
        domain: "communication",
        type: "study",
        minutes: 30,
        title: "Test Activity §17",
      },
    });
    await prisma.card.create({
      data: {
        id: TEST_IDS.card,
        lang: "zh",
        front: "ni",
        back: "bạn",
        cardState: { s: 1 },
        due: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await prisma.aiCall.create({
      data: {
        id: TEST_IDS.aiCall,
        feature: "grading",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        inputTokens: 100,
        outputTokens: 50,
        cacheRead: 20,
        cacheWrite: 10,
        estimatedCost: 0.001,
        latencyMs: 1200,
        ok: true,
      },
    });
  });

  afterAll(async () => {
    // Dọn dữ liệu test.
    await prisma.aiCall.deleteMany({ where: { id: TEST_IDS.aiCall } });
    await prisma.card.deleteMany({ where: { id: TEST_IDS.card } });
    await prisma.activity.deleteMany({ where: { id: TEST_IDS.activity } });
    await prisma.skill.deleteMany({ where: { id: TEST_IDS.skill } });
  });

  it("export trả JSON đủ 18 bảng + có version/exportAt", async () => {
    const { status, body, headers } = await callExport();

    expect(status).toBe(200);
    expect(headers.get("content-type")).toContain("application/json");
    expect(headers.get("content-disposition")).toContain("attachment");
    expect(body.version).toBe("1.0");
    expect(typeof body.exportAt).toBe("string");

    for (const table of EXPECTED_TABLES) {
      expect(Array.isArray(body.tables[table])).toBe(true);
    }
  });

  it("export chứa dữ liệu vừa seed", async () => {
    const { body } = await callExport();

    const skill = body.tables.skill.find((s: any) => s.id === TEST_IDS.skill);
    expect(skill).toBeDefined();
    expect(skill.name).toBe("Test Skill §17");

    const call = body.tables.aiCall.find((c: any) => c.id === TEST_IDS.aiCall);
    expect(call).toBeDefined();
    expect(call.feature).toBe("grading");
    expect(call.estimatedCost).toBeCloseTo(0.001, 6);
  });

  it("import nạp lại đúng dữ liệu đã export", async () => {
    const { body: exported } = await callExport();

    const { status, body } = await callImport(exported);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // Dữ liệu sau import phải khớp.
    const skill = await prisma.skill.findUnique({ where: { id: TEST_IDS.skill } });
    expect(skill?.name).toBe("Test Skill §17");

    const call = await prisma.aiCall.findUnique({ where: { id: TEST_IDS.aiCall } });
    expect(call?.feature).toBe("grading");
    expect(call?.cacheRead).toBe(20);
  });

  it("import từ chối JSON sai schema (400, không đụng DB)", async () => {
    const before = await prisma.aiCall.count();

    const { status, body } = await callImport({ tables: { skill: "không phải array" } });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_schema");

    const after = await prisma.aiCall.count();
    expect(after).toBe(before);
  });

  it("wipe xoá sạch bảng chính", async () => {
    const { status, body } = await callWipe();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    expect(await prisma.aiCall.count()).toBe(0);
    expect(await prisma.skill.count()).toBe(0);
    expect(await prisma.card.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
  });
});
