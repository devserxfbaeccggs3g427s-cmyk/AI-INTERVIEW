import { PrismaClient } from "@prisma/client";
import { createEmptyCard, type Card as FsrsCard } from "ts-fsrs";

import { loadEnv } from "../scripts/load-env";

import { CARDS, type SeedCard } from "./seed-data/cards";
import { SKILL_TREE } from "./seed-data/skills";

// Nạp `.env.local` / `.env` + đặt DATABASE_URL mặc định — phải chạy TRƯỚC
// khi khởi tạo PrismaClient, vì Prisma đọc env lúc khởi tạo.
loadEnv();

const prisma = new PrismaClient();

/**
 * Mốc thời gian CỐ ĐỊNH cho seed.
 *
 * ⚠️ Tuyệt đối không dùng `new Date()` / `Date.now()` ở đây — `npm run db:reset`
 * phải cho ra DB giống hệt nhau (NFR-AF-07).
 */
const SEED_NOW = new Date(2026, 0, 1); // 2026-01-01 00:00 local

/** Card FSRS mới — state `New`, đến hạn đúng mốc seed. */
function newCardState(): FsrsCard {
  return createEmptyCard(SEED_NOW);
}

/**
 * Xoá dữ liệu theo thứ tự con → cha để không vi phạm ràng buộc FK.
 */
async function clearAll(): Promise<void> {
  await prisma.evidence.deleteMany();
  await prisma.review.deleteMany();
  await prisma.reflection.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.planItem.deleteMany();
  await prisma.card.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.dailyState.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.interviewTurn.deleteMany();
  await prisma.interviewSession.deleteMany();
  await prisma.interviewProfile.deleteMany();
  await prisma.testItem.deleteMany();
  await prisma.testSession.deleteMany();
  await prisma.userProfile.deleteMany();
}

/** Kiểm tra tính toàn vẹn của dữ liệu seed trước khi ghi vào DB. */
function assertSeedIntegrity(): void {
  const skillIds = new Set(SKILL_TREE.map((s) => s.id));
  if (skillIds.size !== SKILL_TREE.length) {
    throw new Error(`Skill id trùng lặp: ${SKILL_TREE.length} node nhưng ${skillIds.size} id unique`);
  }

  for (const skill of SKILL_TREE) {
    if (skill.parentId && !skillIds.has(skill.parentId)) {
      throw new Error(`Skill "${skill.id}" có parentId không tồn tại: ${skill.parentId}`);
    }
  }

  const roots = SKILL_TREE.filter((s) => s.parentId === null);
  if (roots.length !== 4) {
    throw new Error(`Phải có đúng 4 node domain-root, thực tế ${roots.length}`);
  }

  const cardIds = new Set(CARDS.map((c) => c.id));
  if (cardIds.size !== CARDS.length) {
    throw new Error(`Card id trùng lặp: ${CARDS.length} thẻ nhưng ${cardIds.size} id unique`);
  }

  const zhCount = CARDS.filter((c) => c.lang === "zh").length;
  const enCount = CARDS.filter((c) => c.lang === "en").length;
  if (zhCount !== 70 || enCount !== 70) {
    throw new Error(`Phải có 70 thẻ zh + 70 thẻ en, thực tế ${zhCount} zh + ${enCount} en`);
  }
}

async function seedProfile(): Promise<void> {
  await prisma.userProfile.create({
    data: {
      name: "DevMode",
      aiTone: "direct",
      // Q2: en + zh là ngoại ngữ học; vi là bản ngữ (chỉ dùng ở module giao tiếp).
      learningLangs: "en,zh,vi",
      // Q3: EN = A1 (vài từ cơ bản), ZH = zero (chưa biết gì).
      enLevel: "A1",
      zhLevel: "zero",
      goals: null,
    },
  });
}

async function seedSkills(): Promise<void> {
  // Tạo theo thứ tự tầng: domain-root → tầng 2 → tầng 3 (parent phải tồn tại trước).
  const byDepth = [1, 2, 3] as const;

  for (const depth of byDepth) {
    for (const node of SKILL_TREE.filter((s) => s.depth === depth)) {
      await prisma.skill.create({
        data: {
          id: node.id,
          name: node.name,
          domain: node.domain,
          parentId: node.parentId,
          // Quy tắc B1: level chỉ tăng qua Evidence — seed luôn = 0.
          level: 0,
          targetLevel: node.targetLevel,
          position: node.position,
        },
      });
    }
  }
}

async function seedCards(): Promise<void> {
  for (const card of CARDS) {
    const state = newCardState();
    await prisma.card.create({
      data: {
        id: card.id,
        lang: card.lang,
        front: card.front,
        frontAlt: card.frontAlt ?? null,
        back: card.back,
        example: card.example ?? null,
        examplePinyin: null,
        hint: null,
        group: card.group,
        mode: card.mode,
        cardState: state as unknown as object,
        due: state.due,
        stability: state.stability,
        difficulty: state.difficulty,
        reps: state.reps,
        lapses: state.lapses,
      },
    });
  }
}

async function main(): Promise<void> {
  console.log("🌱 Seed Daily Loop OS…");

  assertSeedIntegrity();
  console.log(`   ✓ kiểm tra toàn vẹn: ${SKILL_TREE.length} skill, ${CARDS.length} thẻ`);

  await clearAll();
  console.log("   ✓ xoá dữ liệu cũ");

  await seedProfile();
  console.log("   ✓ UserProfile");

  await seedSkills();
  console.log(`   ✓ ${SKILL_TREE.length} node kỹ năng`);

  await seedCards();
  console.log(`   ✓ ${CARDS.length} thẻ ngoại ngữ`);

  console.log("✅ Seed hoàn tất.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seed thất bại:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

export type { SeedCard };
