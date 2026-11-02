import { describe, expect, it } from "vitest";

import {
  createNewCardState,
  applyRating,
  formatInterval,
  previewIntervals,
  toCardState,
  fromCardState,
  migrateCardState,
  isValidCardState,
  FsrsStateCorruptError,
  FsrsStateVersionError,
  scheduler,
  toTsfsrsGrade,
} from "@/lib/fsrs";

import { SRS_SESSION_MAX_CARDS, SRS_MASTERY_STABILITY_DAYS, SRS_HINT_WINDOW_DAYS } from "@/lib/srs-config";

/**
 * FR-LG-01..10 — SRS/FSRS wrapper, thuật toán FSRS đúng, seed 140 thẻ.
 * AC-LG-1 — Mọi chấm điểm đi qua applyRating() = scheduler.next().
 * AC-LG-2 — Thứ tự: đến hạn trước, thẻ mới sau.
 * AC-LG-3 — Tối đa 20 thẻ/phiên.
 * AC-LG-4 — Hết thẻ đến hạn → thẻ mới từ nhóm chưa học.
 */
describe("FR-LG-01..10 — fsrs.ts + srs-config.ts (AC-LG-1..4)", () => {
  const NOW = new Date("2026-10-31T02:00:00.000Z");

  // ──────────────────────────────────────────────────────────────────────
  // createNewCardState
  // ──────────────────────────────────────────────────────────────────────
  it("createNewCardState → state = 0, reps = 0, lapses = 0, stability = 0", () => {
    const s = createNewCardState(NOW);
    expect(s.state).toBe(0);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
    expect(s.stability).toBe(0);
    expect(s.version).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // toCardState / fromCardState round-trip
  // ──────────────────────────────────────────────────────────────────────
  it("toCardState / fromCardState giữ nguyên mọi field", () => {
    const s = createNewCardState(NOW);
    const back = fromCardState(s);
    const again = toCardState(back);
    expect(again).toEqual(s);
  });

  // ──────────────────────────────────────────────────────────────────────
  // applyRating — AC-LG-1: khớp scheduler.next
  // ──────────────────────────────────────────────────────────────────────
  it("applyRating: tất cả 4 mức × New state khớp scheduler.next", () => {
    for (const rating of [1, 2, 3, 4] as const) {
      const applied = applyRating(createNewCardState(NOW), rating, NOW);
      const expected = scheduler.next(
        fromCardState(createNewCardState(NOW)),
        NOW,
        toTsfsrsGrade(rating),
      ).card;
      expect(toCardState(expected)).toEqual(applied.card);
    }
  });

  it("Review state + Again → lapses tăng, due = learning step sau 10 phút", () => {
    const learned = applyRating(createNewCardState(NOW), 4, NOW).card;
    expect(learned.state).toBe(2);
    const later = new Date(NOW.getTime() + 5 * 86_400_000);
    const again = applyRating(learned, 1, later);

    expect(again.card.lapses).toBe(1);

    const dueMs = new Date(again.card.due).getTime();
    expect(dueMs).toBeGreaterThan(later.getTime());
    // Learning step đầu = 10 phút.
    expect(dueMs - later.getTime()).toBe(10 * 60_000);
  });

  // ──────────────────────────────────────────────────────────────────────
  // previewIntervals
  // ──────────────────────────────────────────────────────────────────────
  it("previewIntervals trả đủ 4 key 1..4", () => {
    const p = previewIntervals(createNewCardState(NOW), NOW);
    expect(Object.keys(p).sort()).toEqual(["1", "2", "3", "4"]);
    for (const k of [1, 2, 3, 4] as const) {
      expect(p[k].intervalMinutes).toBeGreaterThanOrEqual(0);
      expect(typeof p[k].label).toBe("string");
      expect(p[k].due).toBeTruthy();
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // formatInterval
  // ──────────────────────────────────────────────────────────────────────
  it("formatInterval biên 0 → 'Ngay bây giờ'", () => {
    expect(formatInterval(0, 1)).toBe("Ngay bây giờ");
    expect(formatInterval(0, 3)).toBe("Ngay bây giờ");
  });

  it("formatInterval biên 1..59 → phút", () => {
    expect(formatInterval(1, 1)).toBe("Lặp lại trong 1 phút");
    expect(formatInterval(59, 3)).toBe("Ôn sau 59 phút");
  });

  it("formatInterval biên 60..1439 → giờ", () => {
    expect(formatInterval(60, 1)).toBe("Lặp lại trong 1 giờ");
    expect(formatInterval(1439, 3)).toBe("Ôn sau 24 giờ");
  });

  it("formatInterval biên 1440 → ngày", () => {
    expect(formatInterval(1440, 1)).toBe("Lặp lại trong 1 ngày");
    expect(formatInterval(10080, 4)).toBe("Ôn sau 7 ngày");
  });

  // ──────────────────────────────────────────────────────────────────────
  // migrateCardState / isValidCardState
  // ──────────────────────────────────────────────────────────────────────
  it("migrateCardState ném FsrsStateVersionError khi version !== 1", () => {
    expect(() => migrateCardState({ version: 0 })).toThrow(FsrsStateVersionError);
    expect(() => migrateCardState({ version: 2 })).toThrow(FsrsStateVersionError);
  });

  it("migrateCardState ném FsrsStateCorruptError khi không phải object", () => {
    expect(() => migrateCardState(null)).toThrow(FsrsStateCorruptError);
    expect(() => migrateCardState(undefined)).toThrow(FsrsStateCorruptError);
    expect(() => migrateCardState("abc")).toThrow(FsrsStateCorruptError);
  });

  it("migrateCardState ném FsrsStateCorruptError khi thiếu field", () => {
    expect(() => migrateCardState({ version: 1, due: "x" })).toThrow(
      FsrsStateCorruptError,
    );
  });

  it("migrateCardState chấp nhận state hợp lệ", () => {
    const s = createNewCardState(NOW);
    expect(migrateCardState(s)).toEqual(s);
  });

  it("isValidCardState: true cho state hợp lệ, false cho hỏng", () => {
    expect(isValidCardState(createNewCardState(NOW))).toBe(true);
    expect(isValidCardState(null)).toBe(false);
    expect(isValidCardState({ version: 0 })).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // srs-config constants
  // ──────────────────────────────────────────────────────────────────────
  it("SRS_SESSION_MAX_CARDS = 20 (AC-LG-3)", () => {
    expect(SRS_SESSION_MAX_CARDS).toBe(20);
  });

  it("SRS_MASTERY_STABILITY_DAYS = 21 (FSRS mature)", () => {
    expect(SRS_MASTERY_STABILITY_DAYS).toBe(21);
  });

  it("SRS_HINT_WINDOW_DAYS = 14 (R5 — phiên âm gợi ý 2 tuần)", () => {
    expect(SRS_HINT_WINDOW_DAYS).toBe(14);
  });
});