/**
 * Wrapper FSRS v4.5 (`ts-fsrs@4.5.0`).
 *
 * Spec yêu cầu **FSRS v4.5** (design.md §8.2 AC-4). `ts-fsrs@6.x` là FSRS-6 và
 * yêu cầu Node >= 24 — nên đã ghim `4.5.0` trong package.json.
 *
 * ⚠️ API của ts-fsrs 4.5: dùng `f.next(card, now, rating)` để chấm 1 lần
 * (trả `{card, log}`). `f.repeat()` trả **preview cho cả 4 rating** nên không
 * dùng được cho luồng chấm thực tế.
 *
 * State lưu trong `Card.cardState` (Json) — cùng shape với `Card` của thư viện.
 */

import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";

export type { Card, Grade, ReviewLog };

/** Rating 1..4 → nhãn hiển thị. `Again=1 · Hard=2 · Good=3 · Easy=4`. */
export const GRADE_LABELS: Record<Grade, string> = {
  1: "Lại",
  2: "Khó",
  3: "Tốt",
  4: "Dễ",
};

/** Instance FSRS dùng chung — thư viện không stateful theo card nên tạo 1 lần. */
const f = fsrs({
  enable_fuzz: false,
  enable_short_term: false,
});

/** Tạo state FSRS mới cho 1 thẻ. */
export function newCardState(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Chấm 1 thẻ → state mới + log lịch sử.
 *
 * @param card   state hiện tại của thẻ (`Card.cardState`)
 * @param rating 1=Again · 2=Hard · 3=Good · 4=Easy
 * @param now    thời điểm chấm (mặc định now)
 */
export function reviewCard(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): { card: Card; log: ReviewLog } {
  const result = f.next(card, now, rating);
  return { card: result.card, log: result.log };
}

/** State rỗng cho thẻ mới tạo. */
export function emptyCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Độ giữ nhớ hiện tại (retrievability) của 1 thẻ — trả về **0..1**.
 *
 * `f.get_retrievability(card, now, false)` trả số thô; `true` trả chuỗi phần trăm.
 */
export function retrievability(card: Card, now: Date = new Date()): number {
  return f.get_retrievability(card, now, false);
}

/** Độ giữ nhớ dạng phần trăm (0..100) — dùng cho `FsrsRetrievabilityCard`. */
export function retrievabilityPercent(card: Card, now: Date = new Date()): number {
  return Math.round(retrievability(card, now) * 1000) / 10;
}

/**
 * Đường cong suy giảm 7 ngày — dùng cho sparkline trong `FsrsRetrievabilityCard`.
 * Trả mảng retention (0..1) cho 7 ngày gần nhất, tính từ `last_review` của thẻ.
 */
export function retentionCurve(card: Card, now: Date = new Date(), days = 7): number[] {
  const lastReview = card.last_review ? new Date(card.last_review) : now;
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const point = new Date(now.getTime() - i * 86_400_000);
    const elapsed = Math.max(
      0,
      Math.floor((point.getTime() - lastReview.getTime()) / 86_400_000),
    );
    if (card.state === 0 /* New */ || card.stability <= 0) {
      out.push(0);
      continue;
    }
    const factor = 19 / 81;
    const r = Math.pow(1 + (factor * elapsed) / card.stability, -0.5);
    out.push(Math.max(0, Math.min(1, r)));
  }
  return out;
}

/** Ngày tới hạn hiển thị dạng "3 ngày" / "Hôm nay" / "Quá hạn 2 ngày". */
export function dueLabel(due: Date, now: Date = new Date()): string {
  const days = Math.round((new Date(due).getTime() - now.getTime()) / 86_400_000);
  if (days <= -1) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  return `${days} ngày`;
}

/** Thẻ đến hạn (due <= now) — hàng đợi ôn tập. */
export function isDue(due: Date, now: Date = new Date()): boolean {
  return new Date(due).getTime() <= now.getTime();
}

/** Chuyển rating số → enum `Rating` của thư viện. */
export function toRating(value: number): Grade {
  switch (value) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 4:
      return Rating.Easy;
    default:
      return Rating.Good;
  }
}
