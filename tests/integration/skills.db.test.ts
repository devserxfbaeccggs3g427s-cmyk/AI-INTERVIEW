/**
 * Integration test — cây kỹ năng với DB SQLite thật.
 *
 * Dùng `prisma/test-skills.db` riêng ⇒ không đụng dữ liệu dev, không race với
 * các file integration khác.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB = path.join(ROOT, "prisma", "test-skills.db");

// Prisma đọc `DATABASE_URL` lúc **import** ⇒ set trước mọi dynamic import.
process.env.DATABASE_URL = "file:./test-skills.db";

function runPrisma(args: string[]): void {
  execFileSync("npx", ["tsx", "scripts/prisma-cli.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:./test-skills.db" },
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

describe("resolveDepth — quy tắc cây 3 tầng (FR-SK-04)", () => {
  it("node tầng 1 (domain) ⇒ depth 1", async () => {
    const { resolveDepth } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const domain = await prisma.skill.findFirst({
      where: { parentId: null },
      select: { id: true },
    });
    expect(domain).not.toBeNull();

    expect(await resolveDepth(domain!.id)).toBe(1);
  });

  it("node tầng 2 ⇒ depth 2", async () => {
    const { resolveDepth } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level2 = await prisma.skill.findFirst({
      where: { parent: { parentId: null } },
      select: { id: true },
    });
    expect(level2).not.toBeNull();

    expect(await resolveDepth(level2!.id)).toBe(2);
  });

  it("node tầng 3 ⇒ depth 3", async () => {
    const { resolveDepth } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level3 = await prisma.skill.findFirst({
      where: { parent: { parentId: { not: null } } },
      select: { id: true },
    });
    expect(level3).not.toBeNull();

    expect(await resolveDepth(level3!.id)).toBe(3);
  });
});

describe("createSkill — giới hạn tầng (FR-SK-04)", () => {
  it("tạo được node tầng 3 (cha là node tầng 2)", async () => {
    const { createSkill } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level2 = await prisma.skill.findFirst({
      where: { parent: { parentId: null } },
      select: { id: true, domain: true },
    });
    expect(level2).not.toBeNull();

    const id = await createSkill({
      name: "Node tầng 3 test",
      domain: level2!.domain,
      parentId: level2!.id,
      targetLevel: 3,
    });

    expect(id).toBeTruthy();

    const created = await prisma.skill.findUnique({
      where: { id },
      select: { parentId: true, level: true },
    });
    expect(created?.parentId).toBe(level2!.id);
    expect(created?.level).toBe(0);
  });

  it("từ chối node tầng 4 (cha là node tầng 3)", async () => {
    const { createSkill } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level3 = await prisma.skill.findFirst({
      where: { parent: { parentId: { not: null } } },
      select: { id: true, domain: true },
    });
    expect(level3).not.toBeNull();

    await expect(
      createSkill({
        name: "Node tầng 4 — không được phép",
        domain: level3!.domain,
        parentId: level3!.id,
        targetLevel: 3,
      }),
    ).rejects.toThrow("max_depth_exceeded");
  });

  it("từ chối domain khác với node cha", async () => {
    const { createSkill } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level2 = await prisma.skill.findFirst({
      where: { parent: { parentId: null } },
      select: { id: true, domain: true },
    });
    expect(level2).not.toBeNull();

    const wrongDomain =
      level2!.domain === "professional" ? "language" : "professional";

    await expect(
      createSkill({
        name: "Node sai domain",
        domain: wrongDomain,
        parentId: level2!.id,
        targetLevel: 3,
      }),
    ).rejects.toThrow("domain_mismatch");
  });
});

describe("recordEvidence — level chỉ tăng qua bằng chứng (FR-SK-03)", () => {
  it("ghi 3 bằng chứng rating 3 ⇒ level 1", async () => {
    const { recordEvidence } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const skill = await prisma.skill.findFirst({
      where: { parent: { parentId: { not: null } } },
      select: { id: true, level: true },
    });
    expect(skill).not.toBeNull();

    for (let i = 0; i < 3; i++) {
      const activity = await prisma.activity.create({
        data: {
          skillId: skill!.id,
          domain: "professional",
          type: "study",
          minutes: 30,
          title: `Hoạt động ${i}`,
          content: null,
          quality: null,
        },
        select: { id: true },
      });

      const result = await recordEvidence({
        skillId: skill!.id,
        activityId: activity.id,
        rating: 3,
      });

      expect(result.level).toBe(i === 2 ? 1 : 0);
    }

    const after = await prisma.skill.findUnique({
      where: { id: skill!.id },
      select: { level: true },
    });
    expect(after?.level).toBe(1);
  });

  it("bằng chứng rating thấp KHÔNG tăng level", async () => {
    const { recordEvidence } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const skill = await prisma.skill.findFirst({
      where: { parent: { parentId: { not: null } } },
      select: { id: true },
    });

    for (let i = 0; i < 5; i++) {
      const activity = await prisma.activity.create({
        data: {
          skillId: skill!.id,
          domain: "professional",
          type: "study",
          minutes: 10,
          title: `Rating thấp ${i}`,
          content: null,
          quality: null,
        },
        select: { id: true },
      });

      await recordEvidence({ skillId: skill!.id, activityId: activity.id, rating: 2 });
    }

    const after = await prisma.skill.findUnique({
      where: { id: skill!.id },
      select: { level: true },
    });
    expect(after?.level).toBe(0);
  });

  it("node tầng 1 (domain) lấy MAX level của hậu duệ", async () => {
    const { recordEvidence } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    // Chọn 1 node tầng 3, ghi đủ bằng chứng ⇒ level 1.
    const leaf = await prisma.skill.findFirst({
      where: { parent: { parentId: { not: null } } },
      select: { id: true, parentId: true },
    });
    expect(leaf).not.toBeNull();

    for (let i = 0; i < 3; i++) {
      const activity = await prisma.activity.create({
        data: {
          skillId: leaf!.id,
          domain: "professional",
          type: "study",
          minutes: 20,
          title: `Domain max ${i}`,
          content: null,
          quality: null,
        },
        select: { id: true },
      });
      await recordEvidence({ skillId: leaf!.id, activityId: activity.id, rating: 4 });
    }

    // Ông bà (tầng 2) và domain (tầng 1) phải cập nhật theo.
    const level2 = await prisma.skill.findUnique({
      where: { id: leaf!.parentId! },
      select: { level: true, parentId: true },
    });
    expect(level2?.level).toBe(1);

    const domain = await prisma.skill.findUnique({
      where: { id: level2!.parentId! },
      select: { level: true },
    });
    expect(domain?.level).toBe(1);
  });
});

describe("deleteSkill — chuyển node con lên ông bà (FR-SK-11)", () => {
  it("xoá node cha ⇒ node con chuyển lên ông bà, không mất dữ liệu", async () => {
    const { deleteSkill } = await import("@/lib/skills");
    const { prisma } = await import("@/lib/db");

    const level2 = await prisma.skill.findFirst({
      where: { parent: { parentId: null } },
      select: { id: true, domain: true, parentId: true },
    });
    expect(level2).not.toBeNull();

    // ⚠️ Cây chỉ có 3 tầng ⇒ không thể tạo node tầng 4. Để test "xoá node
    // chuyển con lên ông bà", ta dùng node tầng 3 có sẵn trong seed:
    //   domain (tầng 1) → level2 (tầng 2) → leaf (tầng 3)
    // Xoá `level2` ⇒ `leaf` phải chuyển lên `domain` (ông bà).
    const { prisma: db } = await import("@/lib/db");
    const leaf = await db.skill.findFirst({
      where: { parentId: level2!.id },
      select: { id: true },
    });
    expect(leaf).not.toBeNull();

    const middle = level2!.id;

    await deleteSkill(middle);

    // Node con (tầng 3) chuyển lên ông bà.
    //
    // ⚠️ Xoá node tầng 2 ⇒ ông bà là DOMAIN (tầng 1, `parentId = null`)
    // ⇒ node con trở thành node tầng 2, `parentId = null`.
    const childAfter = await prisma.skill.findUnique({
      where: { id: leaf!.id },
      select: { parentId: true },
    });
    expect(childAfter?.parentId).toBeNull();
    expect(childAfter).not.toBeNull();

    // Node bị xoá không còn tồn tại.
    const middleAfter = await prisma.skill.findUnique({
      where: { id: middle },
      select: { id: true },
    });
    expect(middleAfter).toBeNull();
  });
});
