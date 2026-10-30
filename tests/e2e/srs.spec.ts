/**
 * E2E — SRS grading (task 10.13 · AC-4).
 *
 * Kiểm chứng:
 *   1. Grade a due card "Good" → card.due matches ts-fsrs (now + 3 days, due > now, state=Review=2)
 *   2. Grade "Again" on a review card → due today-ish and lapses+1
 *
 * ⚠️ Test dùng `prisma` trực tiếp (import tương đối `../../src/lib/db-test`) —
 * đọc DB thật để khẳng định side-effect, không chỉ kiểm tra giao diện.
 * Tests run with workers:1 (per playwright.config.ts).
 */

import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";
import { startOfDay } from "../../src/lib/dates";

/**
 * Tạo state FSRS mới (New) cho 1 thẻ — dùng createEmptyCard qua prisma JSON.
 * ts-fsrs 4.5 với enable_short_term: false → Good trên New state = state 2 (Review),
 * due = now + 3 days.
 */
function freshCardState(now: Date): Record<string, unknown> {
  return {
    state: 0, // New
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    last_review: null,
    due: now.toISOString(),
    // ts-fsrs 4.5 Card fields
    delta: 0,
    running_count: 0,
  };
}

/** Tìm hoặc tạo 1 thẻ en để test — đảm bảo có sẵn trong DB. */
async function findOrCreateTestCard(): Promise<{ id: string; createdAt: Date }> {
  // Tìm thẻ en đã tồn tại
  const existing = await prisma.card.findFirst({
    where: { lang: "en" },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return { id: existing.id, createdAt: existing.createdAt };
  }

  // Tạo thẻ mới nếu chưa có
  const now = new Date();
  const card = await prisma.card.create({
    data: {
      lang: "en",
      front: "test_word",
      frontAlt: null,
      back: "từ kiểm thử",
      note: null,
      example: null,
      examplePinyin: null,
      hint: "gợi ý phiên âm",
      group: "test",
      mode: "recognize",
      cardState: freshCardState(now),
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
    },
  });
  return { id: card.id, createdAt: card.createdAt };
}

/** Reset 1 thẻ về trạng thái New + due = hôm nay — chạy trước mỗi test. */
async function resetCardToNew(cardId: string) {
  const now = new Date();
  // Set to start of today (local)
  const todayStart = startOfDay(now);

  await prisma.card.update({
    where: { id: cardId },
    data: {
      cardState: freshCardState(now),
      due: todayStart,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
    },
  });

  // Delete existing reviews for this card to start fresh
  await prisma.review.deleteMany({ where: { cardId } });
}

test.describe("S10 — SRS grading (AC-4)", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("grade 'Good' trên thẻ mới → due khớp ts-fsrs (now + 3d), state=Review", async ({ request }) => {
    const { id: cardId, createdAt } = await findOrCreateTestCard();
    await resetCardToNew(cardId);

    // Grade "Good" (rating 3)
    const gradeRes = await request.post("/api/srs/grade", {
      data: { cardId, rating: 3 },
    });
    const gradeJson = await gradeRes.json();
    expect(gradeJson.ok).toBe(true);

    const gradedCard = gradeJson.data.card;
    expect(gradedCard.reps).toBe(1);

    // due phải ở tương lai (Good → now + 3 days với enable_short_term: false)
    const dueDate = new Date(gradedCard.due);
    const now = new Date();
    expect(dueDate.getTime()).toBeGreaterThan(now.getTime());

    // due nằm trong vòng 3 ngày tới (ts-fsrs 4.5 Good-on-New → 3d)
    const diffDays = (dueDate.getTime() - now.getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(2.5);
    expect(diffDays).toBeLessThanOrEqual(3.5);

    // Kiểm tra DB: state trong cardState phải là Review (2)
    const dbCard = await prisma.card.findUnique({
      where: { id: cardId },
      select: { cardState: true },
    });
    const state = JSON.parse(dbCard!.cardState as string);
    expect(state.state).toBe(2); // Review state

    // createdAt phải được trả về từ /api/srs/next
    const nextRes = await request.post("/api/srs/next", {
      data: { lang: "en", limit: 1 },
    });
    const nextJson = await nextRes.json();
    expect(nextJson.ok).toBe(true);
    const nextCard = nextJson.data[0];
    expect(nextCard).toBeDefined();
    expect(nextCard.createdAt).toBeDefined();
    expect(typeof nextCard.createdAt).toBe("string");

    // cleanup
    await resetCardToNew(cardId);
  });

  test("grade 'Again' trên thẻ review → due hôm nay + lapses+1", async ({ request }) => {
    const { id: cardId } = await findOrCreateTestCard();
    await resetCardToNew(cardId);

    // Bước 1: Grade "Good" để đưa thẻ sang Review state
    const goodRes = await request.post("/api/srs/grade", {
      data: { cardId, rating: 3 },
    });
    const goodJson = await goodRes.json();
    expect(goodJson.ok).toBe(true);
    expect(goodJson.data.card.lapses).toBe(0);

    // Bước 2: Grade "Again" (rating 1) trên thẻ đã Review
    const againRes = await request.post("/api/srs/grade", {
      data: { cardId, rating: 1 },
    });
    const againJson = await againRes.json();
    expect(againJson.ok).toBe(true);

    const againCard = againJson.data.card;
    // lapses phải tăng lên 1
    expect(againCard.lapses).toBe(1);

    // due phải ở trong ngày hôm nay (Again → due gần ngay, cùng ngày)
    const dueDate = new Date(againCard.due);
    const todayStart = startOfDay(new Date());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

    expect(dueDate.getTime()).toBeGreaterThanOrEqual(todayStart.getTime());
    expect(dueDate.getTime()).toBeLessThan(todayEnd.getTime());

    // cleanup
    await resetCardToNew(cardId);
  });
});
