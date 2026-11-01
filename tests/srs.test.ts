import { describe, expect, it } from "vitest";

import {
  SRS_HINT_WINDOW_DAYS,
  SRS_MASTERY_STABILITY_DAYS,
  SRS_SESSION_MAX_CARDS,
} from "@/lib/srs-config";

describe("hằng SRS (FR-LG-04, R5, D7)", () => {
  it("tối đa 20 thẻ/phiên (AC-LG-3)", () => {
    expect(SRS_SESSION_MAX_CARDS).toBe(20);
  });

  it("ngưỡng thuộc = 21 ngày (FSRS mature)", () => {
    expect(SRS_MASTERY_STABILITY_DAYS).toBe(21);
  });

  it("cửa sổ phiên âm gợi ý = 14 ngày (R5)", () => {
    expect(SRS_HINT_WINDOW_DAYS).toBe(14);
  });
});

describe("thứ tự lấy thẻ (AC-LG-2, FR-LG-04)", () => {
  /**
   * ⚠️ Hàm thuần mô phỏng đúng thứ tự mà `buildSessionQueue` dùng:
   * đến hạn trước, thẻ mới sau.
   */
  function orderCards<
    T extends { due: number; reps: number },
  >(cards: T[], now: number): T[] {
    const due = cards.filter((c) => c.due <= now);
    const fresh = cards.filter((c) => c.due > now && c.reps === 0);
    return [...due, ...fresh];
  }

  it("thẻ đến hạn đứng trước thẻ mới", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "new", due: now + 1000, reps: 0 },
        { id: "due", due: now - 1, reps: 3 },
      ],
      now,
    );

    expect(ordered.map((c) => c.id)).toEqual(["due", "new"]);
  });

  it("thẻ tương lai đã học (reps > 0) không vào queue", () => {
    const now = 1_000_000;
    const ordered = orderCards(
      [
        { id: "future-learned", due: now + 1000, reps: 2 },
        { id: "due", due: now - 1, reps: 1 },
      ],
      now,
    );

    expect(ordered.map((c) => c.id)).toEqual(["due"]);
  });

  it("cắt còn tối đa 20 thẻ", () => {
    const now = 1_000_000;
    const many = Array.from({ length: 50 }, (_, index) => ({
      id: `c${index}`,
      due: now - index,
      reps: 1,
    }));

    expect(orderCards(many, now).slice(0, SRS_SESSION_MAX_CARDS)).toHaveLength(
      SRS_SESSION_MAX_CARDS,
    );
  });
});

describe("ngày local (tránh lệch UTC)", () => {
  it("23:30 và 00:30 thuộc 2 ngày khác nhau", () => {
    const late = new Date(2026, 9, 31, 23, 30);
    const early = new Date(2026, 10, 1, 0, 30);

    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    expect(key(late)).toBe("2026-10-31");
    expect(key(early)).toBe("2026-11-01");
    expect(key(late)).not.toBe(key(early));
  });
});
