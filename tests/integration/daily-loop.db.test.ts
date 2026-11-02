/**
 * Integration test — chạm DB SQLite thật (test DB riêng, không phải dev.db).
 *
 * Mỗi file test dùng DB riêng (`prisma/test-<slug>.db`) ⇒ 2 file chạy song song
 * không race nhau, và không đụng dữ liệu dev.
 * `beforeAll` chạy migrate + seed; `afterEach` dọn dữ liệu nghiệp vụ.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB = path.join(ROOT, "prisma", "test-daily-loop.db");

// Prisma đọc `DATABASE_URL` lúc **import** — phải set TRƯỚC khi import
// `@/lib/db`, nên set ở top-level module (trước mọi `await import`).
process.env.DATABASE_URL = "file:./test-daily-loop.db";

function runPrisma(args: string[]): void {
  execFileSync("npx", ["tsx", "scripts/prisma-cli.ts", ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: "file:./test-daily-loop.db",
    },
    stdio: "pipe",
  });
}

beforeAll(() => {
  // Xoá DB test cũ để luôn bắt đầu từ schema sạch.
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

describe("integration — daily-loop với DB thật", () => {
  it("bấm 'Xong' 1 lần ⇒ đúng 1 Activity + 1 Evidence + PlanItem.done", async () => {
    const { prisma } = await import("@/lib/db");
    const { completePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate, toDateKey } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });
    expect(skill).not.toBeNull();

    await prisma.planItem.create({
      data: {
        date,
        slot: 0,
        domain: "professional",
        action: "Viết 1 REST service Spring Boot",
        detail: null,
        minutes: 30,
        skillId: skill!.id,
        source: "manual",
        done: false,
      },
    });

    // ⚠️ Đo **delta** chứ không đo tổng: seed có sẵn activity mẫu
    // (12 speak + 6 roleplay) ⇒ `count()` tổng không còn là 1.
    const activityBefore = await prisma.activity.count();
    const evidenceBefore = await prisma.evidence.count();

    const result = await completePlanItem({ date, slot: 0 });

    expect(result.alreadyDone).toBe(false);
    expect(await prisma.activity.count()).toBe(activityBefore + 1);
    expect(await prisma.evidence.count()).toBe(evidenceBefore + 1);

    const item = await prisma.planItem.findFirst({ where: { date, slot: 0 } });
    expect(item?.done).toBe(true);

    // PlanItem có `date` chuẩn hóa ⇒ dùng cùng ngày.
    expect(toDateKey(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("bấm 2 lần liên tiếp ⇒ chỉ 1 Activity, lần 2 có alreadyDone=true", async () => {
    const { prisma } = await import("@/lib/db");
    const { completePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });

    await prisma.planItem.create({
      data: {
        date,
        slot: 1,
        domain: "professional",
        action: "Viết test cho REST service",
        detail: null,
        minutes: 25,
        skillId: skill!.id,
        source: "manual",
        done: false,
      },
    });

    const activityBefore = await prisma.activity.count();
    const evidenceBefore = await prisma.evidence.count();

    await completePlanItem({ date, slot: 1 });
    const second = await completePlanItem({ date, slot: 1 });

    expect(second.alreadyDone).toBe(true);
    // ⚠️ Đo delta — seed có sẵn activity mẫu (speak + roleplay).
    expect(await prisma.activity.count()).toBe(activityBefore + 1);
    expect(await prisma.evidence.count()).toBe(evidenceBefore + 1);
  });

  it("slot không có skillId ⇒ tạo Activity nhưng KHÔNG tạo Evidence", async () => {
    const { prisma } = await import("@/lib/db");
    const { completePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());

    await prisma.planItem.create({
      data: {
        date,
        slot: 3,
        domain: "personal",
        action: "Đi bộ 20 phút",
        detail: null,
        minutes: 20,
        skillId: null,
        source: "manual",
        done: false,
      },
    });

    const activityBefore = await prisma.activity.count();
    const evidenceBefore = await prisma.evidence.count();

    await completePlanItem({ date, slot: 3 });

    // ⚠️ Đo delta — seed có sẵn activity mẫu (speak + roleplay).
    expect(await prisma.activity.count()).toBe(activityBefore + 1);
    // Không có skillId ⇒ KHÔNG tạo Evidence.
    expect(await prisma.evidence.count()).toBe(evidenceBefore);
  });

  it("Skill.level KHÔNG đổi sau 1 bằng chứng (P3 — level chỉ tăng qua ngưỡng)", async () => {
    const { prisma } = await import("@/lib/db");
    const { completePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true, level: true },
    });

    await prisma.planItem.create({
      data: {
        date,
        slot: 2,
        domain: "professional",
        action: "Refactor DAO",
        detail: null,
        minutes: 20,
        skillId: skill!.id,
        source: "manual",
        done: false,
      },
    });

    await completePlanItem({ date, slot: 2 });

    const after = await prisma.skill.findUnique({
      where: { id: skill!.id },
      select: { level: true },
    });

    expect(after?.level).toBe(skill!.level);
  });

  it("bỏ đánh dấu ⇒ xoá Activity + Evidence, done=false (R-DL-5)", async () => {
    const { prisma } = await import("@/lib/db");
    const { completePlanItem, uncompletePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });

    await prisma.planItem.create({
      data: {
        date,
        slot: 4,
        domain: "professional",
        action: "Doc source code",
        detail: null,
        minutes: 15,
        skillId: skill!.id,
        source: "manual",
        done: false,
      },
    });

    const activityBefore = await prisma.activity.count();
    const evidenceBefore = await prisma.evidence.count();

    await completePlanItem({ date, slot: 4 });
    expect(await prisma.activity.count()).toBe(activityBefore + 1);

    const undone = await uncompletePlanItem({ date, slot: 4 });

    expect(undone.wasDone).toBe(true);
    // ⚠️ Đo delta — seed có sẵn activity mẫu (speak + roleplay).
    expect(await prisma.activity.count()).toBe(activityBefore);
    expect(await prisma.evidence.count()).toBe(evidenceBefore);

    const item = await prisma.planItem.findFirst({ where: { date, slot: 4 } });
    expect(item?.done).toBe(false);
  });

  it("duyệt kế hoạch 2 lần ⇒ vẫn đúng 6 row, không nhân bản", async () => {
    const { prisma } = await import("@/lib/db");
    const { applyPlan } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });

    const items = [
      { slot: 0, domain: "professional" as const, action: "A1", detail: null, minutes: 30, skillId: skill!.id },
      { slot: 1, domain: "communication" as const, action: "A2", detail: null, minutes: 20, skillId: null },
      { slot: 2, domain: "language" as const, action: "A3", detail: null, minutes: 15, skillId: null },
      { slot: 3, domain: "language" as const, action: "A4", detail: null, minutes: 15, skillId: null },
      { slot: 4, domain: "personal" as const, action: "A5", detail: null, minutes: 20, skillId: null },
      { slot: 5, domain: "personal" as const, action: "A6", detail: null, minutes: 30, skillId: null },
    ];

    await applyPlan({ date, items, source: "manual" });
    await applyPlan({ date, items, source: "manual" });

    expect(await prisma.planItem.count({ where: { date } })).toBe(6);
  });

  it("duyệt lại giữ nguyên slot đã done (FR-DL-05)", async () => {
    const { prisma } = await import("@/lib/db");
    const { applyPlan, completePlanItem } = await import("@/lib/daily-loop");
    const { normalizeDate } = await import("@/lib/dates");

    const date = normalizeDate(new Date());
    const skill = await prisma.skill.findFirst({
      where: { domain: "professional" },
      select: { id: true },
    });

    const base = [
      { slot: 0, domain: "professional" as const, action: "A1", detail: null, minutes: 30, skillId: skill!.id },
      { slot: 1, domain: "communication" as const, action: "A2", detail: null, minutes: 20, skillId: null },
      { slot: 2, domain: "language" as const, action: "A3", detail: null, minutes: 15, skillId: null },
      { slot: 3, domain: "language" as const, action: "A4", detail: null, minutes: 15, skillId: null },
      { slot: 4, domain: "personal" as const, action: "A5", detail: null, minutes: 20, skillId: null },
      { slot: 5, domain: "personal" as const, action: "A6", detail: null, minutes: 30, skillId: null },
    ];

    await applyPlan({ date, items: base, source: "manual" });
    await completePlanItem({ date, slot: 0 });

    // Duyệt lại với nội dung khác ở slot 0 ⇒ slot 0 phải giữ nguyên.
    const changed = base.map((item) =>
      item.slot === 0 ? { ...item, action: "ĐÃ ĐỔI" } : item,
    );

    const result = await applyPlan({ date, items: changed, source: "manual" });

    expect(result.keptDone).toBe(1);

    const slot0 = await prisma.planItem.findFirst({ where: { date, slot: 0 } });
    expect(slot0?.action).toBe("A1");
    expect(slot0?.done).toBe(true);
    expect(await prisma.planItem.count({ where: { date } })).toBe(6);
  });
});

describe("integration — streak & năng lượng tuần (AC-DL-4 / task 5.10)", () => {
  it("42 slot trong 7 ngày, 33 done ⇒ năng lượng tuần 79%", async () => {
    const { prisma } = await import("@/lib/db");
    const { computeCurrentWeeklyEnergy, getPlanForDate } = await import("@/lib/daily-loop");
    const { normalizeDate, addDays } = await import("@/lib/dates");

    const today = normalizeDate(new Date());

    // 7 ngày × 6 slot = 42 slot; 33 slot done.
    //
    // ⚠️ `dayIndex` 0 = cách hôm nay 6 ngày, `dayIndex` 6 = HÔM NAY.
    // Phân bổ: 6 ngày đầu đầy (36 done) + hôm nay 3/6 ⇒ 39 done — quá 33.
    // Dùng: 5 ngày đầu đầy (30) + 1 ngày 3/6 + hôm nay 0 ⇒ 33 done.
    const donePerDay = [6, 6, 6, 6, 6, 3, 0];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const day = addDays(today, -(6 - dayIndex));
      const doneCount = donePerDay[dayIndex];

      for (let slot = 0; slot < 6; slot++) {
        await prisma.planItem.create({
          data: {
            date: day,
            slot,
            domain: ["professional", "communication", "language", "language", "personal", "personal"][slot],
            action: `Slot ${slot}`,
            detail: null,
            minutes: 20,
            skillId: null,
            done: slot < doneCount,
            source: "manual",
          },
        });
      }
    }

    const energy = await computeCurrentWeeklyEnergy(today);

    // 33/42 = 78.57% → làm tròn 79.
    expect(energy.doneSlots).toBe(33);
    expect(energy.totalSlots).toBe(42);
    expect(energy.pct).toBe(79);
    expect(energy.daysWithPlan).toBe(7);
    expect(energy.hasData).toBe(true);

    // Ngày hôm nay có 6 slot, chưa slot nào done ⇒ doneCount = 0.
    const plan = await getPlanForDate(today);
    expect(plan.doneCount).toBe(0);
    expect(plan.totalCount).toBe(6);
  });

  it("ngày không có kế hoạch không tính vào mẫu số", async () => {
    const { prisma } = await import("@/lib/db");
    const { computeCurrentWeeklyEnergy } = await import("@/lib/daily-loop");
    const { normalizeDate, addDays } = await import("@/lib/dates");

    const today = normalizeDate(new Date());

    // Chỉ 2 ngày có kế hoạch, mỗi ngày 6 slot, 3 slot done.
    for (const offset of [0, 1]) {
      const day = addDays(today, -offset);
      for (let slot = 0; slot < 6; slot++) {
        await prisma.planItem.create({
          data: {
            date: day,
            slot,
            domain: ["professional", "communication", "language", "language", "personal", "personal"][slot],
            action: `Slot ${slot}`,
            detail: null,
            minutes: 20,
            skillId: null,
            done: slot < 3,
            source: "manual",
          },
        });
      }
    }

    const energy = await computeCurrentWeeklyEnergy(today);

    expect(energy.totalSlots).toBe(12);
    expect(energy.doneSlots).toBe(6);
    expect(energy.daysWithPlan).toBe(2);
    expect(energy.pct).toBe(50);
  });

  it("streak không reset giữa ngày — hôm nay chưa có Activity thì đếm từ hôm qua", async () => {
    const { prisma } = await import("@/lib/db");
    const { getPlanForDate } = await import("@/lib/daily-loop");
    const { normalizeDate, addDays, toDateKey } = await import("@/lib/dates");

    const today = normalizeDate(new Date());

    // 3 ngày trước có Activity; hôm nay chưa có.
    for (const offset of [1, 2, 3]) {
      const day = addDays(today, -offset);
      await prisma.activity.create({
        data: {
          skillId: null,
          domain: "professional",
          type: "study",
          minutes: 30,
          title: `Học ngày ${toDateKey(day)}`,
          content: null,
          quality: null,
          createdAt: day,
        },
      });
    }

    const plan = await getPlanForDate(today);
    expect(plan.streak).toBe(3);
  });
});
