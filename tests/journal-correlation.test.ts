import { describe, expect, it } from "vitest";

import { analyzeCorrelation, pearson } from "@/lib/journal";

/**
 * FR-PS-05 — Phân tích tương quan chỉ số ↔ hiệu suất học (local, không AI).
 * FR-PS-07 — Dữ liệu chỉ số không bao giờ rời máy (SQLite + JS thuần).
 * AC-PS-9 — ≥7 ngày → sufficiency="ok", ít nhất 1 phát hiện; <7 → "insufficient".
 */
describe("FR-PS-05, FR-PS-07 — journal.ts tương quan Pearson & phân tích", () => {
  // ──────────────────────────────────────────────────────────────────────
  // Pearson
  // ──────────────────────────────────────────────────────────────────────
  it("tương quan hoàn hảo dương = 1", () => {
    expect(
      pearson([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
      ]),
    ).toBe(1);
  });

  it("tương quan hoàn hảo âm = −1", () => {
    expect(
      pearson([
        { x: 1, y: 6 },
        { x: 2, y: 4 },
        { x: 3, y: 2 },
      ]),
    ).toBe(-1);
  });

  it("tương quan yếu ⇒ |r| < 0.4", () => {
    const r = pearson([
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 3 },
      { x: 4, y: 2 },
    ]);

    expect(Math.abs(r)).toBeLessThan(0.4);
  });

  it("<2 điểm ⇒ 0 (không đủ dữ liệu)", () => {
    expect(pearson([{ x: 1, y: 1 }])).toBe(0);
    expect(pearson([])).toBe(0);
  });

  it("hằng số một phía ⇒ 0 (không chia cho 0)", () => {
    expect(
      pearson([
        { x: 3, y: 1 },
        { x: 3, y: 2 },
      ]),
    ).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // analyzeCorrelation
  // ──────────────────────────────────────────────────────────────────────
  it("bỏ qua ngày thiếu chỉ số (sleep null)", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
      { sleep: null, mood: 3, energy: 3, focus: 3, doneSlots: 3 },
    ]);

    const sleep = result.find((r) => r.metric === "sleep");
    expect(sleep?.samples).toBe(2);
  });

  it("<3 mẫu → insight 'Chưa đủ dữ liệu'", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
    ]);

    for (const item of result) {
      expect(item.insight).toContain("Chưa đủ dữ liệu");
    }
  });

  it("ngủ nhiều ⇒ nhiều hành động hơn (correlation > 0.5)", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 7, mood: 4, energy: 4, focus: 4, doneSlots: 5 },
      { sleep: 5, mood: 3, energy: 3, focus: 3, doneSlots: 2 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
    ]);

    const sleep = result.find((r) => r.metric === "sleep");
    expect(sleep?.correlation).toBeGreaterThan(0.5);
    expect(sleep?.insight).toContain("nhiều hành động hoàn thành hơn");
  });

  it("trả đủ 4 chỉ số (sleep, mood, energy, focus)", () => {
    const result = analyzeCorrelation([]);
    expect(result.map((r) => r.metric)).toEqual([
      "sleep",
      "mood",
      "energy",
      "focus",
    ]);
  });

  it("mood âm ↔ doneSlots âm", () => {
    const result = analyzeCorrelation([
      { sleep: 7, mood: 5, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 7, mood: 4, energy: 4, focus: 4, doneSlots: 5 },
      { sleep: 7, mood: 2, energy: 3, focus: 3, doneSlots: 1 },
      { sleep: 7, mood: 1, energy: 3, focus: 3, doneSlots: 0 },
    ]);

    const mood = result.find((r) => r.metric === "mood");
    expect(mood?.correlation).toBeGreaterThan(0.5);
  });
});