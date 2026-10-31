/**
 * Integration test API — gọi route handler trực tiếp (không qua HTTP server).
 *
 * Dùng DB test riêng (`prisma/test-plan-api.db`) — xem `daily-loop.db.test.ts`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB = path.join(ROOT, "prisma", "test-plan-api.db");

process.env.DATABASE_URL = "file:./test-plan-api.db";

function runPrisma(args: string[]): void {
  execFileSync("npx", ["tsx", "scripts/prisma-cli.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:./test-plan-api.db" },
    stdio: "pipe",
  });
}

beforeAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }

  runPrisma(["migrate", "deploy"]);
  runPrisma(["db", "seed"]);
}, 120_000);

afterAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
});

afterEach(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.evidence.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.planItem.deleteMany();
  await prisma.dailyState.deleteMany();
  await prisma.aiCall.deleteMany();
});

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/plan/[date]/complete", () => {
  it("400 khi slot ngoài 0..5", async () => {
    const { DELETE } = await import("@/app/api/plan/[date]/complete/route");
    const ctx = { params: Promise.resolve({ date: "2026-10-31" }) };

    const res = await DELETE(jsonRequest({ slot: 9 }, "DELETE"), ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_input");
  });

  it("400 khi ngày không hợp lệ", async () => {
    const { POST } = await import("@/app/api/plan/[date]/complete/route");
    const ctx = { params: Promise.resolve({ date: "31-10-2026" }) };

    const res = await POST(jsonRequest({ slot: 0 }), ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_input");
  });

  it("404 khi không có plan item cho slot", async () => {
    const { POST } = await import("@/app/api/plan/[date]/complete/route");
    const ctx = { params: Promise.resolve({ date: "2026-10-31" }) };

    const res = await POST(jsonRequest({ slot: 0 }), ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  it("200 + idempotent: bấm 2 lần ⇒ 1 Activity", async () => {
    const { prisma } = await import("@/lib/db");
    const { normalizeDate, toDateKey } = await import("@/lib/dates");
    const { POST } = await import("@/app/api/plan/[date]/complete/route");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });

    await prisma.planItem.create({
      data: {
        date,
        slot: 0,
        domain: "professional",
        action: "Viết REST service",
        detail: null,
        minutes: 30,
        skillId: skill!.id,
        source: "manual",
        done: false,
      },
    });

    // `toDateKey` dùng local time — `toISOString()` sẽ lệch ngày ở UTC.
    const ctx = { params: Promise.resolve({ date: toDateKey(date) }) };

    const first = await POST(jsonRequest({ slot: 0 }), ctx);
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.data.alreadyDone).toBe(false);

    const second = await POST(jsonRequest({ slot: 0 }), ctx);
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.data.alreadyDone).toBe(true);

    expect(await prisma.activity.count()).toBe(1);
  });
});

describe("API /api/plan/items", () => {
  const validItems = [
    { slot: 0, domain: "professional", action: "A1", detail: "", minutes: 30, skillId: null },
    { slot: 1, domain: "communication", action: "A2", detail: "", minutes: 20, skillId: null },
    { slot: 2, domain: "language", action: "A3", detail: "", minutes: 15, skillId: null },
    { slot: 3, domain: "language", action: "A4", detail: "", minutes: 15, skillId: null },
    { slot: 4, domain: "personal", action: "A5", detail: "", minutes: 20, skillId: null },
    { slot: 5, domain: "personal", action: "A6", detail: "", minutes: 30, skillId: null },
  ];

  it("400 khi thiếu slot", async () => {
    const { PATCH } = await import("@/app/api/plan/items/route");

    const res = await PATCH(
      jsonRequest({ date: "2026-10-31", items: validItems.slice(0, 5), apply: false }, "PATCH"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("400 khi sai tổng domain (1/1/2/2)", async () => {
    const { PATCH } = await import("@/app/api/plan/items/route");

    const bad = validItems.map((item, index) =>
      index === 4 ? { ...item, domain: "professional" } : item,
    );

    const res = await PATCH(
      jsonRequest({ date: "2026-10-31", items: bad, apply: false }, "PATCH"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_input");
  });

  it("apply=true ⇒ ghi đúng 6 row", async () => {
    const { prisma } = await import("@/lib/db");
    const { normalizeDate } = await import("@/lib/dates");
    const { PATCH } = await import("@/app/api/plan/items/route");

    const res = await PATCH(
      jsonRequest({ date: "2026-10-31", items: validItems, apply: true }, "PATCH"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.applied).toBe(6);

    const date = normalizeDate(new Date("2026-10-31"));
    expect(await prisma.planItem.count({ where: { date } })).toBe(6);
  });
});

describe("API /api/plan/generate (offline fallback)", () => {
  it("SSE trả event 'done' + 6 slot khi offline", async () => {
    const { POST } = await import("@/app/api/plan/generate/route");

    const res = await POST(jsonRequest({ mode: "fallback" }));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"type":"slot"');
  });

  it("SSE trả 6 slot với đúng tổng domain 1/1/2/2", async () => {
    const { POST } = await import("@/app/api/plan/generate/route");

    const res = await POST(jsonRequest({ mode: "fallback" }));
    const text = await res.text();

    const slotLines = text
      .split("\n")
      .filter((line) => line.startsWith("data: ") && line.includes('"type":"slot"'));

    expect(slotLines).toHaveLength(6);

    const domains = slotLines.map((line) => {
      const payload = JSON.parse(line.slice(6)) as { slot: { domain: string } };
      return payload.slot.domain;
    });

    const counts = domains.reduce<Record<string, number>>((acc, domain) => {
      acc[domain] = (acc[domain] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({ professional: 1, communication: 1, language: 2, personal: 2 });
  });
});
