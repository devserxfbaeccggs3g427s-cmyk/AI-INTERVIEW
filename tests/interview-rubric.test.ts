/**
 * Unit test — rubric.ts (AC-9, task 31.1).
 *
 * Clamp · lội key lạ · đúng rubric theo kind · tổng đúng trung bình.
 */

import { describe, expect, it } from "vitest";

import {
  RUBRIC_BEHAVIORAL,
  RUBRIC_TECHNICAL,
  RUBRIC_BLOCK,
  clampScore,
  computeSessionTotal,
  computeTurnTotal,
  sanitizeScores,
} from "@/lib/interview-rubric";
import { BEHAVIORAL_RUBRIC_KEYS, RUBRIC_KEYS } from "@/lib/interview";
import type { QuestionKind } from "@/lib/interview";

describe("clampScore", () => {
  it("clamp về [0,5]", () => {
    expect(clampScore(5.7)).toBe(5);
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(3.2)).toBe(3.2);
    expect(clampScore(NaN)).toBe(0);
  });
});

describe("sanitizeScores", () => {
  const techKind: QuestionKind = "concept";

  function asTech(out: unknown): Record<string, { score: number; note: string }> {
    return out as unknown as Record<string, { score: number; note: string }>;
  }

  it("lọc key ngoài rubric", () => {
    const raw = {
      accuracy: { score: 4, note: "đúng" },
      clarity: { score: 5, note: "bị loại" },
      depth: { score: 3, note: "ok" },
      reasoning: { score: 4, note: "ok" },
      communication: { score: 4, note: "ok" },
      tradeoff: { score: 4, note: "ok" },
    };
    const out = asTech(sanitizeScores(raw, techKind));
    expect(Object.keys(out).sort()).toEqual([...RUBRIC_KEYS].sort());
    expect(out.clarity).toBeUndefined();
  });

  it("clamp điểm ngoài thang", () => {
    const raw = {
      accuracy: { score: 9, note: "x" },
      depth: { score: -2, note: "x" },
      reasoning: { score: 3, note: "x" },
      communication: { score: 3, note: "x" },
      tradeoff: { score: 3, note: "x" },
    };
    const out = asTech(sanitizeScores(raw, techKind));
    expect(out.accuracy.score).toBe(5);
    expect(out.depth.score).toBe(0);
  });

  it("behavioral ⇒ chỉ 4 tiêu chí, bỏ scores", () => {
    const raw = {
      accuracy: { score: 4, note: "should be dropped" },
      specific: { score: 4, note: "ok" },
      star: { score: 3, note: "ok" },
      selfaware: { score: 2, note: "ok" },
      outcome: { score: 5, note: "ok" },
    };
    const out = sanitizeScores(raw, "behavioral") as unknown as Record<string, { score: number; note: string }>;
    expect(Object.keys(out).sort()).toEqual([...BEHAVIORAL_RUBRIC_KEYS].sort());
    expect(out.accuracy).toBeUndefined();
  });

  it("thiếu key ⇒ điểm 0 + note", () => {
    const raw = { accuracy: { score: 4, note: "ok" } };
    const out = asTech(sanitizeScores(raw, techKind));
    expect(out.depth.score).toBe(0);
    expect(out.depth.note.length).toBeGreaterThan(0);
  });

  it("chấp nhận mảng [score, note]", () => {
    const raw = {
      accuracy: [4.5, "đúng"],
      depth: [3, "ok"],
      reasoning: [3, "ok"],
      communication: [3, "ok"],
      tradeoff: [3, "ok"],
    };
    const out = asTech(sanitizeScores(raw, techKind));
    expect(out.accuracy.score).toBe(4.5);
    expect(out.accuracy.note).toBe("đúng");
  });
});

describe("computeTurnTotal", () => {
  it("trung bình các tiêu chí, làm tròn 2 chữ số", () => {
    const scores = {
      accuracy: { score: 4, note: "ok" },
      depth: { score: 3, note: "ok" },
      reasoning: { score: 5, note: "ok" },
      communication: { score: 4, note: "ok" },
      tradeoff: { score: 4, note: "ok" },
    };
    expect(computeTurnTotal(scores, "concept")).toBe(4);
  });

  it("không có tiêu chí ⇒ 0 (không NaN)", () => {
    expect(computeTurnTotal(null, "concept")).toBe(0);
    expect(computeTurnTotal({}, "concept")).toBe(0);
  });
});

describe("computeSessionTotal", () => {
  it("null khi rỗng", () => {
    expect(computeSessionTotal([])).toBeNull();
  });

  it("trung bình các lượt", () => {
    expect(computeSessionTotal([3.5, 4.1])).toBe(3.8);
  });
});

describe("RUBRIC_BLOCK", () => {
  it("chứa cả 2 rubric + quy tắc chấm", () => {
    expect(RUBRIC_BLOCK).toContain("RUBRIC KỸ THUẬT");
    expect(RUBRIC_BLOCK).toContain("RUBRIC HÀNH VI");
    expect(RUBRIC_BLOCK).toContain("QUY TẮC CHẤM");
  });

  it("không chứa timestamp/UUID", () => {
    expect(RUBRIC_BLOCK).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(RUBRIC_BLOCK).not.toMatch(/Date.now|2026/);
  });
});

describe("RUBRIC_TECHNICAL / RUBRIC_BEHAVIORAL", () => {
  it("đúng số tiêu chí", () => {
    expect(RUBRIC_TECHNICAL.length).toBe(5);
    expect(RUBRIC_BEHAVIORAL.length).toBe(4);
  });

  it("key duy nhất", () => {
    const techKeys = RUBRIC_TECHNICAL.map((c) => c.key);
    expect(new Set(techKeys).size).toBe(5);
    const behKeys = RUBRIC_BEHAVIORAL.map((c) => c.key);
    expect(new Set(behKeys).size).toBe(4);
  });
});
