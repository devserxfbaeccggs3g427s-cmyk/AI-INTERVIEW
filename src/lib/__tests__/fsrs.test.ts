import { describe, expect, it } from "vitest";

import {
  applyRating,
  createNewCardState,
  formatInterval,
  fromCardState,
  migrateCardState,
  previewIntervals,
  toCardState,
  FsrsStateCorruptError,
  FsrsStateVersionError,
  scheduler,
  toTsfsrsGrade,
} from "@/lib/fsrs";

const NOW = new Date("2026-10-31T02:00:00.000Z");

describe("fsrs — wrapper thuần (AC-4)", () => {
  describe("createNewCardState", () => {
    it("state = 0, reps = 0, lapses = 0, stability = 0", () => {
      const s = createNewCardState(NOW);
      expect(s.state).toBe(0);
      expect(s.reps).toBe(0);
      expect(s.lapses).toBe(0);
      expect(s.stability).toBe(0);
      expect(s.version).toBe(1);
    });
  });

  describe("toCardState / fromCardState round-trip", () => {
    it("giữ nguyên mọi field", () => {
      const s = createNewCardState(NOW);
      const back = fromCardState(s);
      const again = toCardState(back);
      expect(again).toEqual(s);
    });
  });

  describe("applyRating — AC-4: khớp scheduler.next", () => {
    it("tất cả 4 mức × New state", () => {
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

      // ⚠️ FSRS: `Again` trên Review state đưa thẻ về learning step đầu
      // (10 phút), KHÔNG phải due = now. Test trước kỳ vọng `due === later`
      // ⇒ sai với hành vi thật của thư viện.
      expect(again.card.lapses).toBe(1);

      // ⚠️ `CardState.due` là ISO-8601 **string**, không phải `Date`.
      const dueMs = new Date(again.card.due).getTime();
      expect(dueMs).toBeGreaterThan(later.getTime());
      // Learning step đầu = 10 phút.
      expect(dueMs - later.getTime()).toBe(10 * 60_000);
    });
  });

  describe("previewIntervals", () => {
    it("trả đủ 4 key 1..4", () => {
      const p = previewIntervals(createNewCardState(NOW), NOW);
      expect(Object.keys(p).sort()).toEqual(["1", "2", "3", "4"]);
      for (const k of [1, 2, 3, 4] as const) {
        expect(p[k].intervalMinutes).toBeGreaterThanOrEqual(0);
        expect(typeof p[k].label).toBe("string");
        expect(p[k].due).toBeTruthy();
      }
    });
  });

  describe("formatInterval", () => {
    it("biên 0 → Ngay bây giờ", () => {
      expect(formatInterval(0, 1)).toBe("Ngay bây giờ");
      expect(formatInterval(0, 3)).toBe("Ngay bây giờ");
    });
    it("biên 1..59 → phút", () => {
      expect(formatInterval(1, 1)).toBe("Lặp lại trong 1 phút");
      expect(formatInterval(59, 3)).toBe("Ôn sau 59 phút");
    });
    it("biên 60..1439 → giờ", () => {
      expect(formatInterval(60, 1)).toBe("Lặp lại trong 1 giờ");
      expect(formatInterval(1439, 3)).toBe("Ôn sau 24 giờ");
    });
    it("biên 1440 → ngày", () => {
      expect(formatInterval(1440, 1)).toBe("Lặp lại trong 1 ngày");
      expect(formatInterval(10080, 4)).toBe("Ôn sau 7 ngày");
    });
  });

  describe("migrateCardState", () => {
    it("ném FsrsStateVersionError khi version !== 1", () => {
      expect(() => migrateCardState({ version: 0 })).toThrow(FsrsStateVersionError);
      expect(() => migrateCardState({ version: 2 })).toThrow(FsrsStateVersionError);
    });
    it("ném FsrsStateCorruptError khi không phải object", () => {
      expect(() => migrateCardState(null)).toThrow(FsrsStateCorruptError);
      expect(() => migrateCardState(undefined)).toThrow(FsrsStateCorruptError);
      expect(() => migrateCardState("abc")).toThrow(FsrsStateCorruptError);
    });
    it("ném FsrsStateCorruptError khi thiếu field", () => {
      expect(() =>
        migrateCardState({ version: 1, due: "x" }),
      ).toThrow(FsrsStateCorruptError);
    });
    it("chấp nhận state hợp lệ", () => {
      const s = createNewCardState(NOW);
      expect(migrateCardState(s)).toEqual(s);
    });
  });
});
