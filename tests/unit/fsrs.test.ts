/**
 * Test FSRS v4.5 — `src/lib/fsrs.ts` (AC-4 · design.md §8.2).
 *
 * 🔑 Điểm cần nhớ về `ts-fsrs@4.5.0`:
 *   - `f.next(card, now, rating)` chấm **1 lần** và trả `{ card, log }`.
 *   - `f.repeat()` trả **preview cho cả 4 rating** → không dùng cho luồng chấm thật.
 *   - Với `enable_short_term: false` (cấu hình của `src/lib/fsrs.ts`), chấm lần đầu
 *     với rating 3 (Good) đưa thẻ thẳng sang state `Review` và `due = now + 3 ngày`.
 *   - `rating = 1` (Again) trên thẻ đang `Review` → `lapses + 1`.
 *
 * ⚠️ Mọi Date trong test dựng theo **giờ local** để không lệch theo múi giờ.
 */

import { describe, expect, it } from "vitest";
import {
  dueLabel,
  emptyCard,
  isDue,
  newCardState,
  retrievability,
  retrievabilityPercent,
  retentionCurve,
  reviewCard,
  toRating,
  GRADE_LABELS,
  type Card,
} from "@/lib/fsrs";

/** 29/10/2026 12:00 giờ local — mốc thời gian cố định của test. */
const NOW = new Date(2026, 9, 29, 12, 0, 0);

describe("newCardState / emptyCard", () => {
  it("thẻ mới có state = New, stability = 0, reps = 0, lapses = 0", () => {
    const card = newCardState(NOW);
    expect(card.state).toBe(0); // State.New
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
  });

  it("emptyCard cho kết quả tương đương newCardState", () => {
    const card = emptyCard(NOW);
    expect(card.state).toBe(0);
    expect(card.stability).toBe(0);
  });

  it("due của thẻ mới là chính thời điểm khởi tạo", () => {
    const card = newCardState(NOW);
    expect(card.due.getTime()).toBe(NOW.getTime());
  });
});

describe("reviewCard — Good (rating 3)", () => {
  it("trả về state mới có stability > 0", () => {
    const { card } = reviewCard(newCardState(NOW), 3, NOW);
    expect(card.stability).toBeGreaterThan(0);
  });

  it("due nằm ở tương lai so với thời điểm chấm", () => {
    const { card } = reviewCard(newCardState(NOW), 3, NOW);
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("state khác New (đã học → sang Review)", () => {
    const { card } = reviewCard(newCardState(NOW), 3, NOW);
    expect(card.state).not.toBe(0);
  });

  it("reps tăng lên 1", () => {
    const { card } = reviewCard(newCardState(NOW), 3, NOW);
    expect(card.reps).toBe(1);
  });

  it("log ghi lại trạng thái TRƯỚC khi chấm (ts-fsrs 4.5)", () => {
    // `buildLog` của ts-fsrs 4.5 snapshot `this.last` — tức state trước review.
    // Với thẻ mới: state = New (0), stability = 0, difficulty = 0.
    const { card, log } = reviewCard(newCardState(NOW), 3, NOW);
    expect(log.rating).toBe(3);
    expect(log.state).toBe(0); // New — trạng thái trước khi chấm
    expect(log.stability).toBe(0);
    expect(log.difficulty).toBe(0);
    // Thẻ MỚI sau khi chấm thì đã có stability > 0 và state = Review.
    expect(card.stability).toBeGreaterThan(0);
    expect(card.state).not.toBe(0);
  });

  it("log.due là mốc vừa chấm, còn card.due là hạn ôn kế tiếp", () => {
    const { card, log } = reviewCard(newCardState(NOW), 3, NOW);
    expect(log.due.getTime()).toBe(NOW.getTime());
    expect(log.review.getTime()).toBe(NOW.getTime());
    expect(card.due.getTime()).toBeGreaterThan(log.due.getTime());
  });

  it("log của lần chấm sau snapshot lại state của lần trước", () => {
    const first = reviewCard(newCardState(NOW), 3, NOW);
    const second = reviewCard(first.card, 1, NOW);
    expect(second.log.state).toBe(first.card.state);
    expect(second.log.stability).toBe(first.card.stability);
  });

  it("difficulty nằm trong khoảng 1..10 của FSRS", () => {
    const { card } = reviewCard(newCardState(NOW), 3, NOW);
    expect(card.difficulty).toBeGreaterThanOrEqual(1);
    expect(card.difficulty).toBeLessThanOrEqual(10);
  });
});

describe("reviewCard — Again (rating 1) tăng lapses", () => {
  it("chấm Again trên thẻ đã Review → lapses tăng", () => {
    const good = reviewCard(newCardState(NOW), 3, NOW).card;
    const again = reviewCard(good, 1, NOW).card;
    expect(again.lapses).toBe(good.lapses + 1);
    expect(again.lapses).toBe(1);
  });

  it("chấm Again lần đầu (thẻ New) → lapses vẫn 0 nhưng state đổi", () => {
    const { card } = reviewCard(newCardState(NOW), 1, NOW);
    expect(card.lapses).toBe(0);
    expect(card.state).not.toBe(0);
  });

  it("Again đặt due lại gần hiện tại (không đẩy xa như Good)", () => {
    const good = reviewCard(newCardState(NOW), 3, NOW).card;
    const again = reviewCard(good, 1, NOW).card;
    expect(again.due.getTime()).toBeLessThan(good.due.getTime());
  });

  it("lapses tích luỹ qua nhiều lần quên", () => {
    let card = reviewCard(newCardState(NOW), 3, NOW).card;
    card = reviewCard(card, 1, NOW).card;
    card = reviewCard(card, 3, NOW).card;
    card = reviewCard(card, 1, NOW).card;
    expect(card.lapses).toBe(2);
  });
});

describe("reviewCard — Hard / Easy", () => {
  it("Easy cho stability lớn hơn Good", () => {
    const good = reviewCard(newCardState(NOW), 3, NOW).card;
    const easy = reviewCard(newCardState(NOW), 4, NOW).card;
    expect(easy.stability).toBeGreaterThan(good.stability);
  });

  it("Hard cho stability nhỏ hơn Good", () => {
    const good = reviewCard(newCardState(NOW), 3, NOW).card;
    const hard = reviewCard(newCardState(NOW), 2, NOW).card;
    expect(hard.stability).toBeLessThan(good.stability);
  });

  it("Easy đẩy due xa hơn Good", () => {
    const good = reviewCard(newCardState(NOW), 3, NOW).card;
    const easy = reviewCard(newCardState(NOW), 4, NOW).card;
    expect(easy.due.getTime()).toBeGreaterThan(good.due.getTime());
  });
});

describe("retrievability / retrievabilityPercent", () => {
  it("thẻ mới có retrievability = 0", () => {
    expect(retrievability(newCardState(NOW), NOW)).toBe(0);
  });

  it("retrievabilityPercent nằm trong 0..100", () => {
    const card = reviewCard(newCardState(NOW), 3, NOW).card;
    for (const offsetDays of [0, 1, 3, 7, 30]) {
      const now = new Date(NOW.getTime() + offsetDays * 86_400_000);
      const pct = retrievabilityPercent(card, now);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("retrievabilityPercent là số (không phải chuỗi phần trăm)", () => {
    const card = reviewCard(newCardState(NOW), 3, NOW).card;
    expect(typeof retrievabilityPercent(card, NOW)).toBe("number");
  });

  it("retrievability giảm dần theo thời gian", () => {
    const card = reviewCard(newCardState(NOW), 3, NOW).card;
    const r0 = retrievability(card, NOW);
    const r7 = retrievability(card, new Date(NOW.getTime() + 7 * 86_400_000));
    expect(r7).toBeLessThan(r0);
  });
});

describe("retentionCurve", () => {
  it("trả mảng 7 phần tử", () => {
    expect(retentionCurve(newCardState(NOW), NOW)).toHaveLength(7);
    expect(retentionCurve(newCardState(NOW), NOW, 7)).toHaveLength(7);
  });

  it("mọi phần tử nằm trong 0..1", () => {
    const card = reviewCard(newCardState(NOW), 3, NOW).card;
    for (const point of retentionCurve(card, NOW)) {
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThanOrEqual(1);
    }
  });

  it("thẻ mới → toàn bộ điểm bằng 0 (chưa có gì để quên)", () => {
    expect(retentionCurve(newCardState(NOW), NOW).every((p) => p === 0)).toBe(true);
  });

  it("sau khi học, điểm gần nhất ≥ điểm xa nhất (suy giảm dần)", () => {
    const card = reviewCard(newCardState(NOW), 3, NOW).card;
    const curve = retentionCurve(card, NOW);
    const first = curve[0];
    const last = curve[curve.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first !== undefined && last !== undefined) {
      expect(last).toBeLessThanOrEqual(first);
    }
  });

  it("hỗ trợ số ngày tuỳ chỉnh", () => {
    expect(retentionCurve(newCardState(NOW), NOW, 14)).toHaveLength(14);
  });
});

describe("dueLabel", () => {
  it("'Hôm nay' khi due đúng bằng now", () => {
    expect(dueLabel(NOW, NOW)).toBe("Hôm nay");
  });

  it("'Ngày mai' khi due lệch 1 ngày", () => {
    expect(dueLabel(new Date(NOW.getTime() + 86_400_000), NOW)).toBe("Ngày mai");
  });

  it("'Quá hạn N ngày' khi due đã qua", () => {
    expect(dueLabel(new Date(NOW.getTime() - 86_400_000), NOW)).toBe("Quá hạn 1 ngày");
    expect(dueLabel(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe("Quá hạn 3 ngày");
  });

  it("'N ngày' khi còn nhiều ngày", () => {
    expect(dueLabel(new Date(NOW.getTime() + 5 * 86_400_000), NOW)).toBe("5 ngày");
  });

  it("'Hôm nay' khi due trong vòng nửa ngày về trước", () => {
    expect(dueLabel(new Date(NOW.getTime() - 3_600_000), NOW)).toBe("Hôm nay");
  });
});

describe("isDue", () => {
  it("true khi due <= now", () => {
    expect(isDue(new Date(NOW.getTime() - 86_400_000), NOW)).toBe(true);
    expect(isDue(NOW, NOW)).toBe(true);
  });

  it("false khi due > now", () => {
    expect(isDue(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(false);
  });
});

describe("toRating & GRADE_LABELS", () => {
  it("ánh xạ đúng số → enum Rating của ts-fsrs", () => {
    expect(toRating(1)).toBe(1);
    expect(toRating(2)).toBe(2);
    expect(toRating(3)).toBe(3);
    expect(toRating(4)).toBe(4);
  });

  it("giá trị lạ → Good (mặc định an toàn)", () => {
    expect(toRating(0)).toBe(3);
    expect(toRating(99)).toBe(3);
  });

  it("nhãn tiếng Việt cho 4 mức chấm", () => {
    expect(GRADE_LABELS[1]).toBe("Lại");
    expect(GRADE_LABELS[2]).toBe("Khó");
    expect(GRADE_LABELS[3]).toBe("Tốt");
    expect(GRADE_LABELS[4]).toBe("Dễ");
  });
});

describe("tính bất biến của state FSRS", () => {
  it("chấm cùng 1 thẻ 2 lần với cùng mốc thời gian cho kết quả giống nhau", () => {
    const card: Card = newCardState(NOW);
    const a = reviewCard(card, 3, NOW).card;
    const b = reviewCard(card, 3, NOW).card;
    expect(a.stability).toBe(b.stability);
    expect(a.difficulty).toBe(b.difficulty);
    expect(a.due.getTime()).toBe(b.due.getTime());
  });

  it("thẻ mới luôn có retrievability = 0 dù đã chấm chưa", () => {
    const card = newCardState(NOW);
    expect(retrievability(card, NOW)).toBe(0);
  });
});
