/**
 * Unit test — lớp nghiệp vụ thuần `src/lib/test.ts`.
 *
 * ⚠️ Task 20.11: `src/lib/test.ts` **KHÔNG** import `src/lib/anthropic.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assignBand,
  averageRubric,
  buildObjectiveExplanation,
  clampLevel,
  ERROR_GROUP_KEYS,
  estimateLevelLocal,
  itemScore,
  LEVEL_ORDER,
  levelLabel,
  normalizeAnswer,
  parallelFormSignature,
  rateStatus,
  scoreObjective,
  summarizeSession,
  TEST_COUNTS,
  TEST_ITEM_DISTRIBUTION,
  TEST_TIMERS_SEC,
  type ScoredItem,
} from "@/lib/test";
import { buildFallbackItem, reconcileGeneratedItems } from "@/lib/test-ai";

const ROOT = path.resolve(__dirname, "..");

function makeItem(overrides: Partial<ScoredItem> = {}): ScoredItem {
  return {
    index: 0,
    itemType: "mc_vocab",
    prompt: "Chọn nghĩa đúng",
    audioText: null,
    options: ["nước", "cà phê", "trà", "sữa"],
    answer: "nước",
    userAnswer: null,
    isCorrect: null,
    cardId: null,
    skillName: null,
    errorGroups: null,
    rubric: null,
    notes: null,
    explanation: null,
    seconds: null,
    flagged: false,
    scored: false,
    ...overrides,
  };
}

describe("normalizeAnswer (task 20.1)", () => {
  it("bỏ khoảng trắng thừa", () => {
    expect(normalizeAnswer("  apple   pie ")).toBe("apple pie");
  });

  it("hạ chữ thường", () => {
    expect(normalizeAnswer("APPLE")).toBe("apple");
  });

  it("bỏ dấu câu cuối", () => {
    expect(normalizeAnswer("apple.")).toBe("apple");
    expect(normalizeAnswer("苹果。")).toBe("苹果");
  });

  it("bỏ dấu nháy", () => {
    expect(normalizeAnswer('"苹果"')).toBe("苹果");
    expect(normalizeAnswer("'apple'")).toBe("apple");
  });

  it("chuẩn hoá pinyin có dấu thanh", () => {
    expect(normalizeAnswer("Nǐ hǎo")).toBe("nǐ hǎo");
  });
});

describe("scoreObjective (task 20.2, 20.3)", () => {
  it("mc_vocab — chọn đúng nội dung option", () => {
    const result = scoreObjective(makeItem(), "nước");
    expect(result.isCorrect).toBe(true);
  });

  it("mc_vocab — chọn sai", () => {
    const result = scoreObjective(makeItem(), "trà");
    expect(result.isCorrect).toBe(false);
  });

  it("mc_vocab — chấp nhận nhãn A–D", () => {
    const result = scoreObjective(makeItem(), "A");
    expect(result.isCorrect).toBe(true);
  });

  it("mc_grammar — chấm như mc_vocab", () => {
    const item = makeItem({ itemType: "mc_grammar" });
    expect(scoreObjective(item, "nước").isCorrect).toBe(true);
  });

  it("listening — chấm như mc_vocab", () => {
    const item = makeItem({ itemType: "listening" });
    expect(scoreObjective(item, "nước").isCorrect).toBe(true);
  });

  it("cloze — khớp chuẩn hoá", () => {
    const item = makeItem({ itemType: "cloze", options: null, answer: "苹果" });
    expect(scoreObjective(item, " 苹果 ").isCorrect).toBe(true);
  });

  it("cloze — chấp nhận biến thể pinyin (frontAlt)", () => {
    const item = makeItem({ itemType: "cloze", options: null, answer: "苹果" });
    expect(scoreObjective(item, "ping guo", ["ping guo"]).isCorrect).toBe(true);
  });

  it("answer = null ⇒ false, không ném lỗi", () => {
    const item = makeItem({ answer: null });
    const result = scoreObjective(item, "nước");
    expect(result.isCorrect).toBe(false);
    expect(result.normalized).toBe("nước");
  });
});

describe("itemScore (task 20.4)", () => {
  it("objective đúng = 1", () => {
    expect(itemScore(makeItem({ isCorrect: true }))).toBe(1);
  });

  it("objective sai = 0", () => {
    expect(itemScore(makeItem({ isCorrect: false }))).toBe(0);
  });

  it("tự luận = trung bình 4 nhóm rubric / 10", () => {
    const item = makeItem({
      itemType: "writing",
      rubric: { grammar: 8, vocab: 6, expression: 10, context: 6 },
    });
    expect(itemScore(item)).toBeCloseTo(0.75, 5);
  });

  it("tự luận chưa chấm = 0", () => {
    expect(itemScore(makeItem({ itemType: "writing", rubric: null }))).toBe(0);
  });

  it("averageRubric = trung bình đúng 4 nhóm", () => {
    expect(averageRubric({ grammar: 8, vocab: 6, expression: 10, context: 6 })).toBe(7.5);
  });

  it("rubric có đúng 4 nhóm lỗi (P4)", () => {
    expect(ERROR_GROUP_KEYS).toEqual(["grammar", "vocab", "expression", "context"]);
  });
});

describe("assignBand (task 20.5)", () => {
  it("lapses >= 2 ⇒ band 3", () => {
    expect(assignBand({ lapses: 2, difficulty: 1, stability: 10 })).toBe(3);
  });

  it("difficulty >= 7 ⇒ band 3", () => {
    expect(assignBand({ lapses: 0, difficulty: 7, stability: 10 })).toBe(3);
  });

  it("stability thấp ⇒ band 2", () => {
    expect(assignBand({ lapses: 0, difficulty: 3, stability: 1 })).toBe(2);
  });

  it("thẻ mạnh ⇒ band 1", () => {
    expect(assignBand({ lapses: 0, difficulty: 2, stability: 20 })).toBe(1);
  });
});

describe("estimateLevelLocal (task 20.6)", () => {
  const stats = (rate: number, total = 10) => [
    {
      itemType: "mc_vocab" as const,
      correct: Math.round(rate * total),
      total,
      rate,
      status: rateStatus(rate),
      avgSeconds: null,
    },
  ];

  it("rỗng ⇒ zero", () => {
    expect(estimateLevelLocal([], 0, 0)).toEqual({ level: "zero", bottleneck: null });
  });

  it("tỷ lệ 0.95 ⇒ B2 (cần ≥0.97 mới lên C1)", () => {
    expect(estimateLevelLocal(stats(0.95), 9.5, 10).level).toBe("B2");
  });

  it("tỷ lệ 0.8 ⇒ A2 (cần ≥0.85 mới lên B1)", () => {
    expect(estimateLevelLocal(stats(0.8), 8, 10).level).toBe("A2");
  });

  it("tỷ lệ 0.5 ⇒ zero", () => {
    expect(estimateLevelLocal(stats(0.5), 5, 10).level).toBe("zero");
  });

  it("tỷ lệ 0.65 ⇒ A1", () => {
    expect(estimateLevelLocal(stats(0.65), 6.5, 10).level).toBe("A1");
  });

  it("có dạng < 40% ⇒ trừ 1 bậc", () => {
    const withWeak = [
      ...stats(0.95),
      {
        itemType: "cloze" as const,
        correct: 1,
        total: 10,
        rate: 0.1,
        status: rateStatus(0.1),
        avgSeconds: null,
      },
    ];
    // 0.96 ⇒ B2 (cần ≥0.97 mới lên C1), có dạng 10% ⇒ trừ 1 bậc ⇒ B1.
    expect(estimateLevelLocal(withWeak, 9.6, 10).level).toBe("B1");
  });

  it("bottleneck = dạng có tỷ lệ thấp nhất", () => {
    const result = estimateLevelLocal(
      [
        ...stats(0.9),
        {
          itemType: "listening" as const,
          correct: 3,
          total: 10,
          rate: 0.3,
          status: rateStatus(0.3),
          avgSeconds: null,
        },
      ],
      9.3,
      10,
    );
    expect(result.bottleneck).toBe("listening");
  });
});

describe("clampLevel (task 20.7)", () => {
  it("AI lệch > 1 bậc ⇒ kéo về band code", () => {
    expect(clampLevel("C1", "A1")).toBe("A1");
    expect(clampLevel("zero", "B1")).toBe("B1");
  });

  it("lệch đúng 1 bậc ⇒ giữ nguyên", () => {
    expect(clampLevel("A2", "A1")).toBe("A2");
    expect(clampLevel("A1", "A2")).toBe("A1");
  });

  it("level hợp lệ ⇒ giữ nguyên", () => {
    expect(clampLevel("B1", "B1")).toBe("B1");
  });
});

describe("levelLabel + LEVEL_ORDER", () => {
  it("LEVEL_ORDER là CEFR đầy đủ (7 bậc)", () => {
    expect(LEVEL_ORDER).toEqual(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("tiếng Trung hiện HSK, tiếng Anh hiện CEFR", () => {
    expect(levelLabel("zh", "B1")).toBe("HSK 3");
    expect(levelLabel("en", "B1")).toBe("CEFR B1");
  });
});

describe("parallelFormSignature (task 20.8)", () => {
  it("cùng itemTypes + bands ⇒ cùng chữ ký", () => {
    const a = parallelFormSignature(
      ["mc_vocab", "cloze"],
      { mc_vocab: 2, cloze: 1 },
    );
    const b = parallelFormSignature(
      ["cloze", "mc_vocab"],
      { cloze: 1, mc_vocab: 2 },
    );
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
  });

  it("bands khác ⇒ chữ ký khác", () => {
    const a = parallelFormSignature(["mc_vocab"], { mc_vocab: 1 });
    const b = parallelFormSignature(["mc_vocab"], { mc_vocab: 3 });
    expect(a).not.toBe(b);
  });

  it("standard khác ⇒ chữ ký khác (task 26.7)", () => {
    const a = parallelFormSignature(["mc_vocab"], { mc_vocab: 1 }, "cefr");
    const b = parallelFormSignature(["mc_vocab"], { mc_vocab: 1 }, "hsk");
    expect(a).not.toBe(b);
  });
});

describe("reconcileGeneratedItems (task 20.9)", () => {
  it("thừa item ⇒ cắt, không nhân bản", () => {
    const generated = [
      { itemType: "mc_vocab" as const, prompt: "a", audioText: null, options: null, answer: "x", cardId: null, skillName: null },
      { itemType: "mc_vocab" as const, prompt: "b", audioText: null, options: null, answer: "y", cardId: null, skillName: null },
      { itemType: "mc_vocab" as const, prompt: "c", audioText: null, options: null, answer: "z", cardId: null, skillName: null },
    ];
    const result = reconcileGeneratedItems(generated, ["mc_vocab", "mc_vocab"], []);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.prompt)).toEqual(["a", "b"]);
  });

  it("thiếu item ⇒ bù + có warnings, không nhân bản", () => {
    const generated = [
      { itemType: "mc_vocab" as const, prompt: "a", audioText: null, options: null, answer: "x", cardId: null, skillName: null },
    ];
    const result = reconcileGeneratedItems(generated, ["mc_vocab", "mc_vocab", "cloze"], []);
    expect(result.items).toHaveLength(3);
    expect(result.warnings.length).toBeGreaterThan(0);
    // Không có 2 prompt giống nhau.
    expect(new Set(result.items.map((i) => i.prompt)).size).toBe(3);
  });

  it("cardId không có trong danh sách thẻ ⇒ bị bỏ (FR-LT-10)", () => {
    const generated = [
      { itemType: "mc_vocab" as const, prompt: "a", audioText: null, options: null, answer: "x", cardId: "fake-card", skillName: null },
    ];
    const result = reconcileGeneratedItems(generated, ["mc_vocab"], ["real-card"]);
    expect(result.items[0].cardId).toBeNull();
  });
});

describe("summarizeSession (task 20.10)", () => {
  it("correct + total khớp items.length", () => {
    const items = [
      makeItem({ index: 0, itemType: "mc_vocab", isCorrect: true }),
      makeItem({ index: 1, itemType: "mc_vocab", isCorrect: false }),
      makeItem({ index: 2, itemType: "cloze", isCorrect: true }),
    ];
    const summary = summarizeSession(items, {
      testId: "t1",
      lang: "zh",
      testType: "benchmark",
      durationSec: 100,
    });
    const sumTotal = summary.byItemType.reduce((sum, stat) => sum + stat.total, 0);
    expect(sumTotal).toBe(items.length);
    expect(summary.correct).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.maxScore).toBe(3);
    expect(summary.score).toBeCloseTo(2, 5);
  });

  it("byItemType tách đúng theo dạng", () => {
    const items = [
      makeItem({ index: 0, itemType: "mc_vocab", isCorrect: true }),
      makeItem({ index: 1, itemType: "mc_vocab", isCorrect: false }),
      makeItem({ index: 2, itemType: "writing", isCorrect: null, rubric: { grammar: 10, vocab: 10, expression: 10, context: 10 } }),
    ];
    const summary = summarizeSession(items, {
      testId: "t1",
      lang: "en",
      testType: "topic",
      durationSec: 60,
    });
    expect(summary.byItemType.map((s) => s.itemType).sort()).toEqual(["mc_vocab", "writing"]);
    expect(summary.wrongItems).toHaveLength(1);
  });

  it("avgSecondsPerItem tính từ `seconds`", () => {
    const items = [
      makeItem({ index: 0, isCorrect: true, seconds: 10 }),
      makeItem({ index: 1, isCorrect: true, seconds: 20 }),
    ];
    const summary = summarizeSession(items, {
      testId: "t1",
      lang: "zh",
      testType: "benchmark",
      durationSec: 30,
    });
    expect(summary.avgSecondsPerItem).toBe(15);
  });
});

describe("cấu hình đề (task 4.2)", () => {
  it("TEST_ITEM_DISTRIBUTION khớp TEST_COUNTS", () => {
    for (const [type, count] of Object.entries(TEST_COUNTS)) {
      expect(TEST_ITEM_DISTRIBUTION[type as keyof typeof TEST_COUNTS]).toHaveLength(count);
    }
  });

  it("TEST_TIMERS_SEC đúng spec (benchmark 30:00, from_content 15:00)", () => {
    expect(TEST_TIMERS_SEC.benchmark).toBe(1800);
    expect(TEST_TIMERS_SEC.from_content).toBe(900);
    expect(TEST_TIMERS_SEC.placement).toBeUndefined();
    expect(TEST_TIMERS_SEC.topic).toBeUndefined();
  });
});

describe("giải thích + fallback item", () => {
  it("buildObjectiveExplanation nêu đáp án đúng", () => {
    const explanation = buildObjectiveExplanation({
      itemType: "mc_vocab",
      answer: "nước",
      options: ["nước", "trà"],
    });
    expect(explanation).toContain("nước");
  });

  it("buildFallbackItem không gắn thẻ (không bịa từ mới)", () => {
    for (const type of ["mc_vocab", "mc_grammar", "cloze", "listening", "writing", "translation"] as const) {
      const item = buildFallbackItem(type, 0);
      expect(item.cardId).toBeNull();
      expect(item.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe("task 20.11 — ranh giới tầng", () => {
  it("`src/lib/test.ts` KHÔNG import `src/lib/anthropic.ts`", () => {
    const source = readFileSync(path.join(ROOT, "src/lib/test.ts"), "utf8");
    // Chỉ kiểm tra câu lệnh import — không kiểm tra chú thích.
    const imports = source
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) || /^\s*}\s*from\s/.test(line));
    expect(imports.join("\n")).not.toContain("lib/anthropic");
    expect(source).not.toContain("@anthropic-ai/sdk");
  });
});
