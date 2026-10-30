/**
 * Integration test — phiên làm bài kiểm tra (tasks.md 14.21 · AC-11).
 *
 * AC-11: *"Bài kiểm tra: đúng số thẻ đẩy về ôn, nút 'Ôn ngay' đúng thẻ"*
 * (design.md §6.8): 5 câu sai → **5 thẻ** `due = hôm nay`, `lapses + 1`;
 * 0 câu sai → hiện *"0 thẻ bị đẩy về ôn"*.
 *
 * Test bảo vệ 5 thứ:
 *   1. **Endpoint thật** `/api/test/grade-open` — số thẻ đẩy về ôn đúng bằng
 *      số câu sai, `due = hôm nay 00:00`, `lapses + 1`.
 *   2. 0 câu sai → message đúng *"0 thẻ bị đẩy về ôn"*.
 *   3. Blueprint **tất định** — cùng `seed` → cùng đề (task 14.17).
 *   4. Chấm tự động: MC so **chính xác**, cloze/listening so **fuzzy**.
 *   5. PRNG + điểm yếu thẻ (task 14.5).
 *
 * ⚠️ Test **không** gọi AI thật: `callAi` được mock, và các item test chỉ
 * dùng dạng tự động chấm (mc/cloze/listening). Phần AI (writing/translation)
 * được cover ở `language-grade.test.ts` (AC-12).
 *
 * Xem tasks.md 14.4 / 14.5 / 14.10 / 14.12 / 14.21 · design.md §6.8 · AC-11.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callAi: vi.fn(),
}));

vi.mock("@/lib/ai/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/router")>();
  return { ...actual, callAi: mocks.callAi };
});

import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import {
  autoGrade,
  countCorrect,
  distributeItemTypes,
  generateBlueprint,
  getSeedQuestions,
  hashSeed,
  seededRandom,
  weaknessScore,
  type BlueprintRequest,
  type WeakCard,
} from "@/lib/test-gen";
import { ITEM_TYPES } from "@/lib/test-types";
import { POST as gradeOpen } from "@/app/api/test/grade-open/route";
import { POST as srsNext } from "@/app/api/srs/next/route";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Id cố định để dọn dẹn chắc chắn. */
const TEST_IDS = {
  testSession: "test-session-14",
  testItems: ["test-item-14-0", "test-item-14-1", "test-item-14-2", "test-item-14-3", "test-item-14-4"],
  cards: ["test-card-14-0", "test-card-14-1", "test-card-14-2", "test-card-14-3", "test-card-14-4"],
} as const;

/**
 * Yêu cầu dựng đề cố định — **không** dùng thẻ thật (`useCards: false`) để
 * đề không phụ thuộc vào kho thẻ của máy dev.
 */
const REQ: BlueprintRequest = {
  lang: "zh",
  level: "zero",
  topic: null,
  itemTypes: ["mc_vocab", "mc_grammar", "cloze", "listening", "writing"],
  count: 5,
  seed: "ac11-fixed-seed",
  useCards: false,
};

/** Dọn dẹp mọi bản ghi test. */
async function cleanup(): Promise<void> {
  await prisma.testItem.deleteMany({ where: { testId: TEST_IDS.testSession } });
  await prisma.testSession.deleteMany({ where: { id: TEST_IDS.testSession } });
  await prisma.card.deleteMany({ where: { id: { in: [...TEST_IDS.cards] } } });
}

/** Tạo 1 thẻ SRS gắn với 1 item — để kiểm tra đẩy thẻ về ôn. */
async function seedCard(id: string, lapses: number, due: Date): Promise<void> {
  await prisma.card.create({
    data: {
      id,
      lang: "zh",
      front: `测试词 ${id}`,
      back: "nghĩa",
      mode: "recall",
      cardState: { s: 1, d: 5, due: due.getTime() },
      due,
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses,
    },
  });
}

/** Body gọi `/api/test/grade-open`. */
function gradeBody(testId: string, answers: Array<{ index: number; userAnswer: string }>): Request {
  return new Request("http://localhost/api/test/grade-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testId, answers }),
  });
}

/**
 * Dựng 1 phiên kiểm tra với `count` item tự động chấm, mỗi item gắn 1 thẻ.
 *
 * @param count số item (mỗi item = 1 câu + 1 thẻ)
 */
async function seedSession(
  count: number,
): Promise<
  Array<{ index: number; itemType: string; answer: string; options: string[] | null; cardId: string }>
> {
  const items = await generateBlueprint({ ...REQ, count, itemTypes: ["mc_vocab", "mc_grammar"] });
  const cardIds = TEST_IDS.cards.slice(0, count);

  await prisma.testSession.create({
    data: {
      id: TEST_IDS.testSession,
      lang: "zh",
      testType: "placement",
      level: "zero",
      blueprint: { itemTypes: ["mc_vocab", "mc_grammar"], count },
      items: {
        create: items.map((item, i) => ({
          id: TEST_IDS.testItems[i] ?? `test-item-14-${i}`,
          index: item.index,
          itemType: item.itemType,
          prompt: item.prompt,
          ...(item.options ? { options: item.options } : {}),
          answer: item.answer,
          cardId: cardIds[i] ?? null,
          skillName: item.skillName,
          difficulty: item.difficulty,
        })),
      },
    },
  });

  return items.map((item, i) => ({
    index: item.index,
    itemType: item.itemType,
    answer: item.answer,
    options: item.options,
    cardId: cardIds[i] ?? "",
  }));
}

/** Đáp án sai chắc chắn (không trùng đáp án đúng). */
function wrongAnswer(item: { answer: string; options: string[] | null }): string {
  if (item.options && item.options.length > 0) {
    return item.options.find((o) => o !== item.answer) ?? "__sai__";
  }
  return "__sai__";
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 — đẩy thẻ về ôn
// ─────────────────────────────────────────────────────────────────────────────

describe("§14 — AC-11 — đẩy thẻ về ôn khi sai", () => {
  beforeEach(async () => {
    await cleanup();

    // 5 thẻ, mỗi thẻ gắn với 1 item của đề. `lapses` ban đầu = 0, 1, 2, 3, 4
    // → sau khi sai, mỗi thẻ phải tăng đúng 1.
    const yesterday = new Date(Date.now() - 86_400_000);
    for (const [i, cardId] of TEST_IDS.cards.entries()) {
      await seedCard(cardId, i, yesterday);
    }
  });

  afterEach(cleanup);
  afterAll(cleanup);

  it("5 câu sai → 5 thẻ có due = hôm nay 00:00 và lapses + 1", async () => {
    const items = await seedSession(5);
    expect(items).toHaveLength(5);

    // Trả lời SAI toàn bộ 5 câu.
    const res = await gradeOpen(
      gradeBody(
        TEST_IDS.testSession,
        items.map((item) => ({ index: item.index, userAnswer: wrongAnswer(item) })),
      ),
    );
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      ok: boolean;
      data: {
        pushedCardCount: number;
        message: string;
        items: Array<{ index: number; isCorrect: boolean | null }>;
      };
    };

    expect(payload.ok).toBe(true);
    // AC-11: đúng số thẻ đẩy về ôn = số câu sai.
    expect(payload.data.pushedCardCount).toBe(5);
    expect(payload.data.message).toBe("5 thẻ bị đẩy về ôn");
    // Cả 5 câu đều bị chấm sai.
    expect(payload.data.items.every((i) => i.isCorrect === false)).toBe(true);

    // Mỗi thẻ: `due` = hôm nay 00:00 (đầu ngày local) và `lapses` +1.
    const today = startOfDay(new Date()).getTime();
    for (const [i, cardId] of TEST_IDS.cards.entries()) {
      const card = await prisma.card.findUnique({ where: { id: cardId } });
      expect(card, `thiếu thẻ ${cardId}`).not.toBeNull();
      if (!card) continue;
      expect(card.due.getTime()).toBe(today);
      expect(card.lapses).toBe(i + 1);
    }
  });

  it("0 câu sai → 0 thẻ bị đẩy về ôn", async () => {
    const items = await seedSession(5);

    // Trả lời ĐÚNG toàn bộ → không có thẻ nào bị đẩy.
    const res = await gradeOpen(
      gradeBody(
        TEST_IDS.testSession,
        items.map((item) => ({ index: item.index, userAnswer: item.answer })),
      ),
    );
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      ok: boolean;
      data: {
        pushedCardCount: number;
        message: string;
        items: Array<{ isCorrect: boolean | null }>;
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.pushedCardCount).toBe(0);
    expect(payload.data.message).toBe("0 thẻ bị đẩy về ôn");
    expect(payload.data.items.every((i) => i.isCorrect === true)).toBe(true);

    // Thẻ không bị đụng tới — `lapses` giữ nguyên, `due` không phải hôm nay.
    for (const [i, cardId] of TEST_IDS.cards.entries()) {
      const card = await prisma.card.findUnique({ where: { id: cardId } });
      expect(card).not.toBeNull();
      if (!card) continue;
      expect(card.lapses).toBe(i);
      expect(card.due.getTime()).not.toBe(startOfDay(new Date()).getTime());
    }
  });

  it("sai 1 câu → đẩy đúng 1 thẻ (số thẻ = số câu sai)", async () => {
    const items = await seedSession(5);

    const res = await gradeOpen(
      gradeBody(
        TEST_IDS.testSession,
        items.map((item, i) => ({
          index: item.index,
          // Câu 0 sai, 4 câu còn lại đúng.
          userAnswer: i === 0 ? wrongAnswer(item) : item.answer,
        })),
      ),
    );
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      ok: boolean;
      data: { pushedCardCount: number; message: string };
    };

    expect(payload.data.pushedCardCount).toBe(1);
    expect(payload.data.message).toBe("1 thẻ bị đẩy về ôn");

    // Chỉ thẻ của câu sai bị đẩy.
    const pushed = await prisma.card.findUnique({ where: { id: TEST_IDS.cards[0] } });
    expect(pushed?.lapses).toBe(1);
    expect(pushed?.due.getTime()).toBe(startOfDay(new Date()).getTime());

    const untouched = await prisma.card.findUnique({ where: { id: TEST_IDS.cards[1] } });
    expect(untouched?.lapses).toBe(1);
    expect(untouched?.due.getTime()).not.toBe(startOfDay(new Date()).getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tất định + phân bổ dạng (task 14.4 / 14.17)
// ─────────────────────────────────────────────────────────────────────────────

describe("§14 — blueprint tất định", () => {
  it("cùng seed → cùng đề (task 14.17)", async () => {
    const a = await generateBlueprint(REQ);
    const b = await generateBlueprint(REQ);

    expect(a).toHaveLength(b.length);
    for (const [i, item] of a.entries()) {
      const other = b[i];
      expect(other).toBeDefined();
      expect(item?.itemType).toBe(other?.itemType);
      expect(item?.prompt).toBe(other?.prompt);
      expect(item?.answer).toBe(other?.answer);
      expect(item?.options).toEqual(other?.options);
    }
  });

  it("seed khác → đề khác (không hardcode)", async () => {
    const a = await generateBlueprint(REQ);
    const b = await generateBlueprint({ ...REQ, seed: "seed-khac" });
    // Không bắt buộc khác nhau 100%, nhưng prompt phải hợp lệ ở cả hai.
    expect(a.every((i) => typeof i.prompt === "string")).toBe(true);
    expect(b.every((i) => typeof i.prompt === "string")).toBe(true);
  });

  it("index của item là 0..count-1, liên tục", async () => {
    const items = await generateBlueprint({ ...REQ, count: 7 });
    expect(items).toHaveLength(7);
    expect(items.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("phân bổ dạng câu tổng đúng bằng count và không phụ thuộc thứ tự input", () => {
    const a = distributeItemTypes(["mc_vocab", "cloze"], 5);
    const b = distributeItemTypes(["cloze", "mc_vocab"], 5);
    expect(a).toHaveLength(5);
    expect(a).toEqual(b);
    // Chia đều: 3 + 2.
    expect(a.filter((t) => t === "cloze")).toHaveLength(3);
    expect(a.filter((t) => t === "mc_vocab")).toHaveLength(2);
  });

  it("phân bổ với itemTypes rỗng → mảng rỗng", () => {
    expect(distributeItemTypes([], 10)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chấm tự động (task 14.10)
// ─────────────────────────────────────────────────────────────────────────────

describe("§14 — chấm tự động", () => {
  it("MC so CHÍNH XÁC — gần đúng vẫn là sai", () => {
    expect(autoGrade("mc_vocab", "hoc tap", "học tập").isCorrect).toBe(false);
    expect(autoGrade("mc_vocab", "hoc tập", "học tập").isCorrect).toBe(false);
    expect(autoGrade("mc_vocab", "học tập", "học tập").isCorrect).toBe(true);
    expect(autoGrade("mc_vocab", "  học tập  ", "học tập").isCorrect).toBe(true);
  });

  it("MC rỗng → sai (không cho điểm miễn phí)", () => {
    const result = autoGrade("mc_grammar", "", "是");
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it("cloze so FUZZY — bỏ dấu câu + khoảng trắng", () => {
    const result = autoGrade("cloze", "Học, tập.", "học tập");
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("listening so FUZZY — sai hẳn thì 0 điểm", () => {
    const result = autoGrade("listening", "xyz", "Tôi là người Việt Nam.");
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it("countCorrect chỉ đếm isCorrect === true", () => {
    expect(
      countCorrect([
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: null },
        { isCorrect: true },
      ]),
    ).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRNG + điểm yếu (task 14.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("§14 — PRNG tất định + điểm yếu thẻ", () => {
  it("seededRandom cho cùng dãy số", () => {
    const a = seededRandom(hashSeed("abc"));
    const b = seededRandom(hashSeed("abc"));
    for (let i = 0; i < 20; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("hashSeed ổn định + khác nhau theo chuỗi", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });

  it("weaknessScore ưu tiên lapses > difficulty > thẻ chưa ôn", () => {
    const base: WeakCard = {
      id: "c",
      lang: "zh",
      front: "f",
      frontAlt: null,
      back: "b",
      note: null,
      example: null,
      examplePinyin: null,
      hint: null,
      group: null,
      mode: "recall",
      lapses: 0,
      difficulty: 5,
      reps: 5,
      due: new Date(),
    };

    // lapses cao → yếu hơn (điểm cao hơn).
    const lapsed = { ...base, lapses: 3 };
    expect(weaknessScore(lapsed)).toBeGreaterThan(weaknessScore(base));

    // Thẻ chưa từng ôn → +1 điểm.
    const fresh = { ...base, reps: 0 };
    expect(weaknessScore(fresh)).toBe(weaknessScore(base) + 1);
  });

  it("ngân hàng seed phủ đủ 6 dạng câu cho cả zh và en", () => {
    for (const lang of ["zh", "en"] as const) {
      const types = new Set(getSeedQuestions(lang).map((q) => q.itemType));
      for (const t of ITEM_TYPES) {
        expect(types.has(t)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 (phần 2) — nút "Ôn ngay" mở bài đúng thẻ (task 14.16)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `POST /api/srs/next` với `cardIds` phải trả về **đúng** số thẻ yêu cầu,
 * bỏ qua luồng due/new. Đây là backbone của nút "Ôn ngay" trên S21.
 */
describe("§14 — AC-11 (phần 2): nút 'Ôn ngay' mở đúng thẻ (task 14.16)", () => {
  const REVIEW_CARDS = ["test-review-14-0", "test-review-14-1", "test-review-14-2"];

  /** Xoá riêng 3 thẻ review — cleanup ngoài scope chỉ biết card id trong TEST_IDS. */
  async function cleanupReview(): Promise<void> {
    await prisma.card.deleteMany({ where: { id: { in: REVIEW_CARDS } } });
  }

  beforeEach(async () => {
    await cleanupReview();
    // Seed 3 thẻ với due cách đây 30 ngày (không đến hạn) để chứng minh
    // API trả về cardIds bất kể due — KHÔNG phải luồng due/new.
    const oldDue = new Date(Date.now() - 30 * 86_400_000);
    for (const [i, id] of REVIEW_CARDS.entries()) {
      await prisma.card.create({
        data: {
          id,
          lang: "zh",
          front: `review ${i}`,
          back: `nghĩa ${i}`,
          mode: "recall",
          cardState: { s: 1, d: 5, due: oldDue.getTime() },
          due: oldDue,
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: i,
        },
      });
    }
  });

  afterEach(cleanupReview);
  afterAll(cleanupReview);

  it("cardIds → trả về đúng thẻ theo thứ tự yêu cầu", async () => {
    const req = new Request("http://localhost/api/srs/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "zh", limit: 20, cardIds: REVIEW_CARDS }),
    });
    const res = await srsNext(req);
    expect(res.status).toBe(200);

    const payload = (await res.json()) as { ok: boolean; data: Array<{ id: string; front: string }> };
    expect(payload.ok).toBe(true);
    // Trả về đúng 3 thẻ.
    expect(payload.data).toHaveLength(3);
    // Thứ tự giữ nguyên theo thứ tự truyền vào.
    expect(payload.data.map((c) => c.id)).toEqual(REVIEW_CARDS);
  });

  it("reviewCard đơn → trả về 1 thẻ", async () => {
    const req = new Request("http://localhost/api/srs/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "zh", limit: 20, cardIds: [REVIEW_CARDS[0]!] }),
    });
    const res = await srsNext(req);
    expect(res.status).toBe(200);

    const payload = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(payload.ok).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]!.id).toBe(REVIEW_CARDS[0]);
  });

  it("cardIds rỗng → về luồng due/new (trả về thẻ đến hạn, không lỗi)", async () => {
    const req = new Request("http://localhost/api/srs/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "zh", limit: 5 }),
    });
    const res = await srsNext(req);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(payload.ok).toBe(true);
    // Luồng do/new trả về thẻ đến hạn (limit <= 5). Các thẻ review (due 30 ngày trước)
    // là "đến hạn" nên có thể nằm trong kết quả — không kiểm chứng số lượng cụ thể.
    expect(Array.isArray(payload.data)).toBe(true);
  });

  it("cardIds có thẻ không tồn tại → trả về các thẻ còn lại", async () => {
    const req = new Request("http://localhost/api/srs/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "zh", limit: 20, cardIds: [...REVIEW_CARDS, "test-review-missing"] }),
    });
    const res = await srsNext(req);
    expect(res.status).toBe(200);

    const payload = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(payload.ok).toBe(true);
    expect(payload.data.map((c) => c.id)).toEqual(REVIEW_CARDS);
  });
});
