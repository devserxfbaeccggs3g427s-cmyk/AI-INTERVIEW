/**
 * Đẩy thẻ SRS về ôn hôm nay khi người dùng sai trong bài kiểm tra (FR-LT-06).
 *
 * ⚠️ D3: mỗi thẻ chỉ bị áp `Rating.Again` **một lần mỗi phiên** — 1 thẻ sai ở
 * 3 câu không được tăng `lapses` 3 lần.
 *
 * ⚠️ D4: `due = hôm nay 00:00 local` (không phải interval của FSRS) — AC-11.
 *
 * Nguồn: `.kiro/specs/language-test/design.md` §3.2.
 */

import { Rating, createEmptyCard, fsrs, type Card as FsrsCard } from "ts-fsrs";

import { prisma } from "@/lib/db";
import { normalizeDate, toDateKey } from "@/lib/dates";
import type { ItemType, ScoredItem } from "@/lib/test";

/** Scheduler FSRS — tham số mặc định, cố định suốt vòng đời app. */
const scheduler = fsrs();

/** Desired retention mặc định của FSRS — dùng cho retrievability. */
const DESIRED_RETENTION = 0.9;

export interface PushedCard {
  cardId: string;
  front: string;
  frontAlt: string | null;
  back: string;
  due: string;
  lapses: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reason: string;
}

export interface CardSnapshot {
  cardState: unknown;
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

export interface AppliedAgain extends CardSnapshot {
  cardState: FsrsCard;
}

/**
 * Parse `Card.cardState` JSON — hỏng ⇒ `null` (không ném lỗi).
 */
export function safeParseCardState(raw: unknown): FsrsCard | null {
  if (!raw || typeof raw !== "object") return null;
  const state = raw as Partial<FsrsCard>;
  if (typeof state.due !== "string" && typeof state.due !== "number" && !(state.due instanceof Date)) {
    return null;
  }
  if (typeof state.stability !== "number" || typeof state.difficulty !== "number") {
    return null;
  }
  if (typeof state.state !== "number") return null;
  return state as FsrsCard;
}

/**
 * Áp rating `Again` 1 lần:
 * - `cardState` hỏng ⇒ tạo card mới (vẫn ghi `lapses + 1`, `due = today`).
 * - `due` bị ép về hôm nay 00:00 local (AC-11).
 * - `stability` / `difficulty` lấy từ kết quả FSRS (không tự tính tay).
 */
export function applyAgain(card: CardSnapshot, now: Date): AppliedAgain {
  const today = normalizeDate(now);
  const parsed = safeParseCardState(card.cardState);
  const prev: FsrsCard = parsed ?? createEmptyCard(today);

  const { card: next } = scheduler.next(prev, now, Rating.Again);

  return {
    cardState: next,
    due: today,
    stability: next.stability,
    difficulty: next.difficulty,
    reps: card.reps + 1,
    lapses: card.lapses + 1,
  };
}

/**
 * Ước lượng retrievability (xác suất nhớ) để hiển thị "Retrievability: 28%".
 *
 * Dùng forgetting curve FSRS với desired retention 0.9.
 */
export function estimateRetrievability(card: {
  stability: number;
  due: Date;
  lastReview?: Date | null;
}): number {
  if (!card.stability || card.stability <= 0) return 0;

  const now = new Date();
  const last = card.lastReview ?? card.due;
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000),
  );

  // FSRS-6: `R = (1 + FACTOR * elapsed / stability) ^ DECAY`.
  const decay = 0.1542;
  const factor = 19 / 81;
  const value =
    (1 + (factor * elapsedDays) / card.stability) ** decay;
  const clamped = Math.min(1, Math.max(0, value));
  void DESIRED_RETENTION;
  return Math.round(clamped * 1000) / 1000;
}

export interface WrongItemLike {
  index: number;
  itemType: ItemType;
  cardId: string | null;
  userAnswer: string | null;
  isCorrect: boolean | null;
  flagged: boolean;
}

/**
 * Áp FSRS `Again` cho các thẻ bị sai trong bài kiểm tra.
 *
 * - Dedupe theo `cardId` (giữ lần xuất hiện đầu tiên để làm lý do).
 * - Bỏ qua câu bỏ trống (`userAnswer` rỗng) và câu chỉ gắn cờ (FR-LT-17).
 * - Bỏ qua `cardId` không tồn tại — không ném lỗi, không tính vào `pushedCards`.
 * - Ghi `Review { cardId, rating: 1, state, source: "test" }` cho mỗi thẻ.
 */
export async function applyFsrsAgain(
  wrongItems: ReadonlyArray<Pick<
    ScoredItem,
    "index" | "itemType" | "cardId" | "userAnswer" | "isCorrect" | "flagged"
  >>,
  now: Date = new Date(),
): Promise<PushedCard[]> {
  // 1. Lọc + dedupe.
  const seen = new Set<string>();
  const targets: WrongItemLike[] = [];

  for (const item of wrongItems) {
    if (item.isCorrect !== false) continue;
    if (!item.cardId || seen.has(item.cardId)) continue;
    if (!item.userAnswer || item.userAnswer.trim() === "") continue;
    if (item.flagged) continue;
    seen.add(item.cardId);
    targets.push({ ...item, cardId: item.cardId });
  }

  if (targets.length === 0) return [];

  // 2. Nạp thẻ — thẻ đã xoá ⇒ bỏ qua.
  const cardIds = targets.map((t) => t.cardId).filter((id): id is string => id !== null);
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      front: true,
      frontAlt: true,
      back: true,
      due: true,
      stability: true,
      difficulty: true,
      reps: true,
      lapses: true,
      cardState: true,
    },
  });

  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const pushed: PushedCard[] = [];

  for (const target of targets) {
    const card = cardMap.get(target.cardId!);
    if (!card) continue; // thẻ đã xoá → bỏ qua, không crash

    const before = {
      cardState: card.cardState,
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
    };

    const applied = applyAgain(before, now);

    await prisma.$transaction([
      prisma.card.update({
        where: { id: card.id },
        data: {
          cardState: applied.cardState as unknown as object,
          due: applied.due,
          stability: applied.stability,
          difficulty: applied.difficulty,
          reps: applied.reps,
          lapses: applied.lapses,
        },
      }),
      prisma.review.create({
        data: {
          cardId: card.id,
          rating: 1, // Again
          state: applied.cardState as unknown as object,
          source: "test",
        },
      }),
    ]);

    pushed.push({
      cardId: card.id,
      front: card.front,
      frontAlt: card.frontAlt,
      back: card.back,
      due: toDateKey(applied.due),
      lapses: applied.lapses,
      stability: applied.stability,
      difficulty: applied.difficulty,
      retrievability: estimateRetrievability({
        stability: card.stability,
        due: card.due,
      }),
      reason: `Câu ${String(target.index + 1).padStart(2, "0")} — ${target.itemType}`,
    });
  }

  return pushed;
}
