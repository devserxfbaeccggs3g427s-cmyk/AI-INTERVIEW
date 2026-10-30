/**
 * E2E — Bài kiểm tra ngoại ngữ (task 14.21 · AC-11 · AC-12).
 *
 * Kiểm chứng (design.md §6.8):
 *   1. **5 câu sai → 5 thẻ `due = hôm nay`** (`lapses + 1`) — AC-11.
 *   2. **0 câu sai → "0 thẻ bị đẩy về ôn"**, không crash — AC-11.
 *   3. Trang kết quả S21 render được (radar + bảng twin + thẻ sai).
 *   4. Trang danh sách S19 render 4 thẻ loại bài + biểu đồ benchmark.
 *   5. "Làm bài tương tự" sinh đề mới cùng độ khó (task 14.17).
 *
 * ⚠️ Test KHÔNG phụ thuộc AI:
 *   - `/api/test/blueprint` là task **AI-free** (task 14.4) → dựng đề tất định.
 *   - Chỉ dùng dạng câu tự động chấm (mc_vocab) → `autoGrade`, không gọi AI.
 *
 * Test dùng `prisma` trực tiếp (import tương đối `../../src/lib/db-test`) —
 * đọc DB thật để khẳng định side-effect, không chỉ kiểm tra giao diện.
 * Cùng DB với dev server (`prisma/dev.db`) nên dọn dẹp phải triệt để.
 *
 * Xem tasks.md 14.21 · design.md §4.19 / §6.8 · AC-11 / AC-12.
 */

import { expect, test, type APIRequestContext } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";
import { startOfDay } from "../../src/lib/dates";

/** Prefix id cố định để dọn dẹn chắc chắn. */
const PREFIX = "e2e-test-14";
const CARD_IDS = Array.from({ length: 5 }, (_, i) => `${PREFIX}-card-${i}`);

/** `lapses` rất cao → thẻ nằm TOP đầu bảng "yếu" → chắc chắn được chọn vào đề. */
const SEED_LAPSES = 99;

/** Ids do test tạo ra — dùng để dọn dẹn cuối file. */
const createdTestIds: string[] = [];
const createdActivityIds: string[] = [];

/** Skill "Tiếng Trung" — `finish` sẽ ghi Evidence vào đây. */
const LANG_SKILL = { name: "Tiếng Trung", domain: "language" };

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Dựng `count` thẻ SRS "yếu" (lapses cao) để blueprint chắc chắn lấy đúng chúng. */
async function seedCards(count: number) {
  const yesterday = new Date(Date.now() - 86_400_000);
  for (const [i, id] of CARD_IDS.slice(0, count).entries()) {
    await prisma.card.upsert({
      where: { id },
      update: {},
      create: {
        id,
        lang: "zh",
        front: `pinyin-${i}`,
        frontAlt: `汉字${i}`,
        back: `nghĩa-${i}`,
        mode: "recall",
        cardState: {
          state: 1,
          stability: 1,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 0,
          reps: 0,
          lapses: SEED_LAPSES,
          due: yesterday.toISOString(),
        },
        due: yesterday,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: SEED_LAPSES,
      },
    });
  }
}

/**
 * Dựng đề 5 câu MC qua endpoint thật `/api/test/blueprint` (AI-free, task 14.4).
 *
 * Dùng `itemTypes: ["mc_vocab"]` + `useCards: true` → mỗi item gắn đúng 1 thẻ
 * SRS ⇒ endpoint `/api/test/grade-open` có `cardId` để đẩy về ôn (task 14.12).
 */
async function seedSession(request: APIRequestContext, count = 5) {
  const res = await request.post("/api/test/blueprint", {
    data: {
      lang: "zh",
      level: "zero",
      itemTypes: ["mc_vocab"],
      count,
      seed: `${PREFIX}-seed`,
      useCards: true,
    },
  });
  const json = (await res.json()) as {
    ok: boolean;
    data: {
      testId: string;
      items: Array<{
        index: number;
        itemType: string;
        prompt: string;
        answer: string;
        options: string[] | null;
        cardId: string | null;
      }>;
    };
  };

  expect(json.ok).toBe(true);
  expect(json.data.items).toHaveLength(count);
  createdTestIds.push(json.data.testId);

  return json.data;
}

/** Đáp án sai chắc chắn (không trùng đáp án đúng). */
function wrongAnswer(item: { answer: string; options: string[] | null }): string {
  if (item.options && item.options.length > 0) {
    return item.options.find((o) => o !== item.answer) ?? "__sai__";
  }
  return "__sai__";
}

/** Xoá sạch dữ liệu test (TestSession → TestItem cascade; Activity → Evidence cascade). */
async function cleanup() {
  for (const testId of createdTestIds.splice(0)) {
    await prisma.testSession.deleteMany({ where: { id: testId } });
  }
  for (const activityId of createdActivityIds.splice(0)) {
    await prisma.activity.deleteMany({ where: { id: activityId } });
  }
  await prisma.card.deleteMany({ where: { id: { in: CARD_IDS } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe("S19–S21 — Bài kiểm tra ngoại ngữ (AC-11 / AC-12)", () => {
  // Dev server compile lần đầu khá lâu → nới timeout.
  test.setTimeout(90_000);

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("S19 — danh sách bài kiểm tra: 4 thẻ loại + biểu đồ benchmark + level", async ({ page }) => {
    await page.goto("/test");

    // 4 loại bài kiểm tra (task 14.1).
    await expect(page.getByText("Định vị trình độ", { exact: true })).toBeVisible();
    await expect(page.getByText("Theo chủ đề", { exact: true })).toBeVisible();
    await expect(page.getByText("Chuẩn kiểm tra", { exact: true })).toBeVisible();
    await expect(page.getByText("Từ nội dung", { exact: true })).toBeVisible();

    // Mỗi thẻ có số câu + cờ đồng hồ (timer) cho benchmark/from_content.
    await expect(page.getByText("20 câu", { exact: true })).toBeVisible();
    await expect(page.getByText("15 câu", { exact: true })).toBeVisible();
    await expect(page.getByText("40 câu", { exact: true })).toBeVisible();
    await expect(page.getByText("10 câu", { exact: true })).toBeVisible();

    // Benchmark chart (task 14.3).
    await expect(page.getByTestId("benchmark-chart")).toBeVisible();

    // Bộ chuyển ngôn ngữ + trình độ ước tính (task 14.2).
    await expect(page.getByRole("button", { name: "Tiếng Trung" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiếng Anh" })).toBeVisible();
    await expect(page.getByText("Trình độ:")).toBeVisible();
  });

  test("5 câu sai → 5 thẻ có due = hôm nay (lapses + 1)", async ({ request }) => {
    await cleanup();
    await seedCards(5);
    const session = await seedSession(request, 5);

    // Chấm sai toàn bộ qua endpoint thật.
    const res = await request.post("/api/test/grade-open", {
      data: {
        testId: session.testId,
        answers: session.items.map((item) => ({
          index: item.index,
          userAnswer: wrongAnswer(item),
          seconds: 5,
        })),
      },
    });
    const json = (await res.json()) as {
      ok: boolean;
      data: { pushedCardCount: number; message: string; items: Array<{ isCorrect: boolean | null }> };
    };

    expect(json.ok).toBe(true);
    expect(json.data.items.every((i) => i.isCorrect === false)).toBe(true);
    // AC-11: đúng số thẻ bị đẩy về ôn = số câu sai.
    expect(json.data.pushedCardCount).toBe(5);
    expect(json.data.message).toBe("5 thẻ bị đẩy về ôn");

    // Mỗi thẻ: due = hôm nay 00:00 (giờ local) + lapses tăng đúng 1.
    const today = startOfDay(new Date()).getTime();
    for (const item of session.items) {
      expect(item.cardId, `câu ${item.index} phải gắn thẻ`).not.toBeNull();
      const card = await prisma.card.findUnique({ where: { id: item.cardId! } });
      expect(card, `thiếu thẻ ${item.cardId}`).not.toBeNull();
      if (!card) continue;
      expect(card.due.getTime()).toBe(today);
      expect(card.lapses).toBe(SEED_LAPSES + 1);
    }
  });

  test("0 câu sai → '0 thẻ bị đẩy về ôn', không crash", async ({ request, page }) => {
    await cleanup();
    await seedCards(5);
    const session = await seedSession(request, 5);

    // Trả lời ĐÚNG toàn bộ.
    const res = await request.post("/api/test/grade-open", {
      data: {
        testId: session.testId,
        answers: session.items.map((item) => ({
          index: item.index,
          userAnswer: item.answer,
          seconds: 3,
        })),
      },
    });
    const json = (await res.json()) as {
      ok: boolean;
      data: { pushedCardCount: number; message: string; items: Array<{ isCorrect: boolean | null }> };
    };

    expect(json.ok).toBe(true);
    expect(json.data.items.every((i) => i.isCorrect === true)).toBe(true);
    expect(json.data.pushedCardCount).toBe(0);
    expect(json.data.message).toBe("0 thẻ bị đẩy về ôn");

    // Thẻ không bị đụng tới — lapses giữ nguyên, due không phải hôm nay.
    const today = startOfDay(new Date()).getTime();
    for (const item of session.items) {
      const card = await prisma.card.findUnique({ where: { id: item.cardId! } });
      expect(card).not.toBeNull();
      if (!card) continue;
      expect(card.lapses).toBe(SEED_LAPSES);
      expect(card.due.getTime()).not.toBe(today);
    }

    // Trang kết quả S21 mở được và hiện đúng thông điệp (không crash).
    await page.goto(`/test/${session.testId}`);
    await expect(page.getByTestId("result-radar")).toBeVisible();
    await expect(page.getByText("0 thẻ bị đẩy về ôn")).toBeVisible();
  });

  test("S21 — trang kết quả: radar + bảng twin + thẻ sai + Activity (task 14.19)", async ({ request, page }) => {
    await cleanup();
    await seedCards(5);
    const session = await seedSession(request, 5);

    // 3 câu sai, 2 câu đúng → 3 thẻ bị đẩy về ôn.
    const answers = session.items.map((item, i) => ({
      index: item.index,
      userAnswer: i < 3 ? wrongAnswer(item) : item.answer,
      seconds: 4,
    }));

    const gradeRes = await request.post("/api/test/grade-open", {
      data: { testId: session.testId, answers },
    });
    const gradeJson = (await gradeRes.json()) as {
      ok: boolean;
      data: { pushedCardCount: number; message: string; totalScore: number; maxScore: number; durationSec: number };
    };
    expect(gradeJson.ok).toBe(true);
    expect(gradeJson.data.pushedCardCount).toBe(3);
    expect(gradeJson.data.message).toBe("3 thẻ bị đẩy về ôn");

    // Hoàn tất bài → tạo Activity + Evidence (task 14.19).
    const skillBefore = await prisma.skill.findFirst({
      where: LANG_SKILL,
      select: { id: true, level: true },
    });

    const finishRes = await request.post("/api/test/finish", {
      data: {
        testId: session.testId,
        totalScore: gradeJson.data.totalScore,
        maxScore: gradeJson.data.maxScore,
        durationSec: gradeJson.data.durationSec,
      },
    });
    const finishJson = (await finishRes.json()) as {
      ok: boolean;
      data: { activityId: string | null; evidenceId: string | null; skillId: string | null };
    };
    expect(finishJson.ok).toBe(true);
    expect(finishJson.data.activityId).not.toBeNull();
    if (finishJson.data.activityId) createdActivityIds.push(finishJson.data.activityId);

    const activity = await prisma.activity.findUnique({
      where: { id: finishJson.data.activityId! },
    });
    expect(activity).not.toBeNull();
    expect(activity?.domain).toBe("language");
    expect(activity?.type).toBe("test");
    expect(activity?.aiScore).toBe(gradeJson.data.totalScore);

    // Evidence gắn với skill "Tiếng Trung" (nếu skill tồn tại).
    if (skillBefore) {
      const evidence = await prisma.evidence.findFirst({
        where: { activityId: finishJson.data.activityId! },
      });
      expect(evidence?.skillId).toBe(skillBefore.id);
      // Không để lọt lại skill level của DB thật.
      await prisma.skill.update({
        where: { id: skillBefore.id },
        data: { level: skillBefore.level },
      });
    }

    // Trang kết quả S21.
    await page.goto(`/test/${session.testId}`);
    await expect(page.getByTestId("result-radar")).toBeVisible();
    // 3 thẻ sai → LapseCards hiện tối đa 3 thẻ.
    await expect(page.getByText("Ôn lại thẻ sai")).toBeVisible();
    await expect(page.getByText("3 thẻ", { exact: true })).toBeVisible();
    // Bảng twin của radar (task 14.15).
    await page.getByRole("button", { name: "Xem bảng" }).click();
    await expect(page.getByRole("columnheader", { name: "Dạng câu" })).toBeVisible();
  });

  test("'Làm bài tương tự' → sinh đề mới cùng độ khó (task 14.17)", async ({ request, page }) => {
    await cleanup();
    await seedCards(5);
    const session = await seedSession(request, 5);

    const res = await request.post("/api/test/similar", {
      data: { testId: session.testId },
    });
    const json = (await res.json()) as { ok: boolean; data: { testId: string } };

    expect(json.ok).toBe(true);
    expect(json.data.testId).not.toBe(session.testId);
    createdTestIds.push(json.data.testId);

    // Đề mới có cùng số câu và cùng phân bổ dạng.
    const similar = await prisma.testSession.findUnique({
      where: { id: json.data.testId },
      include: { items: { orderBy: { index: "asc" } } },
    });
    expect(similar).not.toBeNull();
    expect(similar?.items.length).toBe(5);
    expect(similar?.level).toBe(session.items.length > 0 ? similar?.level : null);

    // Nút "Làm bài tương tự" hiện trên S21 và dẫn tới đề mới.
    await page.goto(`/test/${session.testId}`);
    await expect(page.getByRole("button", { name: /Làm bài tương tự/i })).toBeVisible();
  });
});
