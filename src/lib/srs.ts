import { prisma } from "@/lib/db";
import {
  applyRating,
  createNewCardState,
  formatInterval,
  previewIntervals,
  retrievability,
  type CardState,
  type GradeRating,
} from "@/lib/fsrs";
import {
  SRS_HINT_WINDOW_DAYS,
  SRS_MASTERY_STABILITY_DAYS,
  SRS_SESSION_MAX_CARDS,
} from "@/lib/srs-config";

/**
 * Lớp nghiệp vụ SRS ôn tập thẻ ngôn ngữ (S09) — FR-LG-01..10.
 *
 * ⚠️ AC-LG-1 — dùng **đúng** thuật toán FSRS: mọi cập nhật đi qua
 * `applyRating()` (bọc `scheduler.next`), không tự tính interval.
 *
 * ⚠️ AC-LG-2 — thứ tự lấy thẻ: **đến hạn trước**, thẻ mới sau.
 * ⚠️ AC-LG-3 — tối đa 20 thẻ/phiên.
 * ⚠️ AC-LG-4 — hết thẻ đến hạn ⇒ lấy thẻ mới từ nhóm chưa học.
 */

import type { SrsCardDTO, SrsLang, SrsProgressDTO } from "@/lib/srs-types";

// ⚠️ Re-export cho server-side import; Client Component import trực tiếp
// từ `@/lib/srs-types` để không kéo `@/lib/db` vào browser bundle.
export type { SrsCardDTO, SrsLang, SrsProgressDTO };

export interface SrsSessionDTO {
  id: string;
  lang: SrsLang;
  cards: SrsCardDTO[];
  /** Vị trí hiện tại trong queue. */
  index: number;
  /** Tổng số thẻ trong phiên. */
  total: number;
  /** Số thẻ đã ôn xong trong phiên. */
  done: number;
  /** Thẻ đến hạn (có trong queue) vs thẻ mới (bổ sung). */
  dueCount: number;
  newCount: number;
}

/* ══ Truy vấn thẻ ═══════════════════════════════════════════════════════ */

/**
 * Lấy queue thẻ cho 1 phiên ôn (AC-LG-2..4).
 *
 * @param lang — ngôn ngữ; đổi ngôn ngữ giữa phiên không trộn thẻ (AC-LG-10).
 * @param now — thời điểm hiện tại.
 */
export async function buildSessionQueue(
  lang: SrsLang,
  now: Date = new Date(),
): Promise<SrsCardDTO[]> {
  const cards = await prisma.card.findMany({
    where: { lang },
    orderBy: [{ due: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      lang: true,
      front: true,
      frontAlt: true,
      back: true,
      note: true,
      example: true,
      examplePinyin: true,
      hint: true,
      group: true,
      mode: true,
      due: true,
      reps: true,
      lapses: true,
      stability: true,
      difficulty: true,
      cardState: true,
      createdAt: true,
    },
  });

  if (cards.length === 0) return [];

  const dueCards = cards.filter((card) => card.due.getTime() <= now.getTime());
  const newCards = cards.filter(
    (card) => card.due.getTime() > now.getTime() && card.reps === 0,
  );

  // ⚠️ AC-LG-2 — đến hạn trước, thẻ mới sau.
  // ⚠️ AC-LG-3 — tối đa 20 thẻ/phiên.
  const queue = [...dueCards, ...newCards].slice(0, SRS_SESSION_MAX_CARDS);

  return queue.map((card) => toCardDTO(card, now));
}

/**
 * Chuyển row `Card` → DTO.
 */
function toCardDTO(
  card: {
    id: string;
    lang: string;
    front: string;
    frontAlt: string | null;
    back: string;
    note: string | null;
    example: string | null;
    examplePinyin: string | null;
    hint: string | null;
    group: string | null;
    mode: string;
    due: Date;
    reps: number;
    lapses: number;
    stability: number;
    difficulty: number;
    cardState: unknown;
    createdAt: Date;
  },
  now: Date,
): SrsCardDTO {
  const state = readCardState(card.cardState);
  const r = retrievability(state, now);

  return {
    id: card.id,
    lang: card.lang as SrsLang,
    front: card.front,
    frontAlt: card.frontAlt,
    back: card.back,
    note: card.note,
    example: card.example,
    examplePinyin: card.examplePinyin,
    hint: card.hint,
    group: card.group,
    mode: card.mode,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: r,
    mastered: card.stability >= SRS_MASTERY_STABILITY_DAYS,
    // ⚠️ Phiên âm gợi ý chỉ dùng 2 tuần đầu (R5).
    showHint:
      card.hint !== null &&
      now.getTime() - card.createdAt.getTime() <=
        SRS_HINT_WINDOW_DAYS * 86_400_000,
  };
}

/**
 * Đọc `Card.cardState` — JSON cũ hoặc lỗi ⇒ tạo state mới.
 */
export function readCardState(raw: unknown): CardState {
  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<CardState>;

    // ⚠️ Validate shape tối thiểu — `Card.cardState` lưu JSON của
    // `CardState` (không phải `FsrsCard`) ⇒ dùng trực tiếp, không cần
    // `fromCardState` (hàm đó đi theo hướng ngược: CardState → FsrsCard).
    if (
      typeof candidate.due === "string" &&
      typeof candidate.stability === "number" &&
      typeof candidate.difficulty === "number" &&
      typeof candidate.state === "number"
    ) {
      return {
        version: 1,
        due: candidate.due,
        stability: candidate.stability,
        difficulty: candidate.difficulty,
        scheduledDays: candidate.scheduledDays ?? 0,
        learningSteps: candidate.learningSteps ?? 0,
        reps: candidate.reps ?? 0,
        lapses: candidate.lapses ?? 0,
        state: candidate.state,
        lastReview: candidate.lastReview ?? null,
      };
    }
  }

  // State hỏng / thiếu ⇒ reset thẻ (không làm hỏng phiên ôn).
  return createNewCardState();
}

/* ══ Chấm điểm 1 thẻ ════════════════════════════════════════════════════ */

export interface SrsGradeResult {
  cardId: string;
  rating: GradeRating;
  /** State mới sau khi ôn. */
  cardState: CardState;
  /** Thời điểm đến hạn mới. */
  due: string;
  /** Nhãn khoảng cách tiếp theo (tiếng Việt). */
  intervalLabel: string;
  /** Khoảng cách tới lượt ôn kế tiếp (phút). */
  intervalMinutes: number;
  /** Số lượt ôn cộng dồn. */
  reps: number;
  /** Số lần quên. */
  lapses: number;
  /** Stability mới (ngày). */
  stability: number;
}

/**
 * Chấm điểm 1 thẻ theo FSRS (AC-LG-1).
 *
 * ⚠️ Mọi tính toán đi qua `applyRating()` — không tự suy luận interval.
 */
export async function gradeCard(input: {
  cardId: string;
  rating: GradeRating;
  now?: Date;
}): Promise<SrsGradeResult> {
  const now = input.now ?? new Date();

  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    select: {
      id: true,
      cardState: true,
      reps: true,
      lapses: true,
      stability: true,
      difficulty: true,
    },
  });

  if (!card) throw new Error("card_not_found");

  const before = readCardState(card.cardState);
  const { card: nextState, log } = applyRating(before, input.rating, now);

  await prisma.card.update({
    where: { id: card.id },
    data: {
      cardState: nextState as unknown as object,
      due: new Date(nextState.due),
      reps: card.reps + 1,
      lapses: card.lapses + (input.rating === 1 ? 1 : 0),
      stability: nextState.stability,
      difficulty: nextState.difficulty,
    },
  });

  // Ghi log lượt ôn — nguồn cho streak + báo cáo tuần.
  await prisma.review.create({
    data: {
      cardId: card.id,
      rating: input.rating,
      state: log as unknown as object,
      at: now,
      source: "srs",
    },
  });

  const intervalMinutes = Math.max(
    0,
    Math.round((new Date(nextState.due).getTime() - now.getTime()) / 60_000),
  );

  return {
    cardId: card.id,
    rating: input.rating,
    cardState: nextState,
    due: nextState.due,
    intervalLabel: formatInterval(intervalMinutes, input.rating),
    intervalMinutes,
    reps: card.reps + 1,
    lapses: card.lapses + (input.rating === 1 ? 1 : 0),
    stability: nextState.stability,
  };
}

/**
 * Preview 4 mức chấm cho 1 thẻ — hiển thị "lần sau: 3 ngày" trước khi bấm.
 */
export async function previewGrades(
  cardId: string,
  now: Date = new Date(),
): Promise<Record<string, { label: string; intervalMinutes: number; due: string }>> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { cardState: true },
  });

  if (!card) throw new Error("card_not_found");

  const preview = previewIntervals(readCardState(card.cardState), now);

  const result: Record<
    string,
    { label: string; intervalMinutes: number; due: string }
  > = {};

  for (const rating of [1, 2, 3, 4] as GradeRating[]) {
    result[String(rating)] = {
      label: preview[rating].label,
      intervalMinutes: preview[rating].intervalMinutes,
      due: preview[rating].due,
    };
  }

  return result;
}

/* ══ Tiến độ & streak (AC-LG-6) ═══════════════════════════════════════════ */

/**
 * Tiến độ ôn tập theo ngôn ngữ (AC-LG-6).
 *
 * ⚠️ Tiến độ là **bằng chứng** (P3): đếm số thẻ đã thuộc / đang học /
 * chưa học — KHÔNG hiển thị % hoàn thành mơ hồ (P7).
 */
export async function getSrsProgress(
  lang: SrsLang,
  now: Date = new Date(),
): Promise<SrsProgressDTO> {
  const cards = await prisma.card.findMany({
    where: { lang },
    select: {
      reps: true,
      stability: true,
      due: true,
      cardState: true,
    },
  });

  const mastered = cards.filter(
    (c) => c.stability >= SRS_MASTERY_STABILITY_DAYS,
  ).length;
  const learning = cards.filter(
    (c) => c.reps > 0 && c.stability < SRS_MASTERY_STABILITY_DAYS,
  ).length;
  const fresh = cards.filter((c) => c.reps === 0).length;
  const dueToday = cards.filter((c) => c.due.getTime() <= now.getTime()).length;

  const avgRetrievability =
    cards.length === 0
      ? 0
      : cards.reduce(
          (sum, c) => sum + retrievability(readCardState(c.cardState), now),
          0,
        ) / cards.length;

  return {
    lang,
    total: cards.length,
    mastered,
    learning,
    fresh,
    dueToday,
    avgRetrievability: Number(avgRetrievability.toFixed(3)),
    streak: await getStreak(lang, now),
  };
}

/**
 * Chuỗi ngày ôn liên tiếp (AC-LG-6).
 *
 * Đếm số ngày liên tiếp (theo giờ local) có ít nhất 1 lượt ôn.
 */
export async function getStreak(
  lang: SrsLang,
  now: Date = new Date(),
): Promise<number> {
  const cardIds = await prisma.card.findMany({
    where: { lang },
    select: { id: true },
  });

  if (cardIds.length === 0) return 0;

  const reviews = await prisma.review.findMany({
    where: { cardId: { in: cardIds.map((c) => c.id) } },
    select: { at: true },
    orderBy: { at: "desc" },
  });

  if (reviews.length === 0) return 0;

  // Tập các ngày local có hoạt động.
  const days = new Set(reviews.map((r) => toLocalDay(r.at)));

  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  // Nếu hôm nay chưa ôn ⇒ bắt đầu từ hôm qua.
  if (!days.has(toLocalDay(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (days.has(toLocalDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/** Ngày local `yyyy-MM-dd` (không lệch UTC). */
function toLocalDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ══ Thẻ thủ công (AC-LG-11) ═════════════════════════════════════════════ */

export interface ManualCardInput {
  lang: SrsLang;
  front: string;
  back: string;
  frontAlt?: string | null;
  note?: string | null;
  example?: string | null;
  group?: string | null;
}

/**
 * Thêm thẻ thủ công (AC-LG-11).
 *
 * ⚠️ Thẻ mới có `reps = 0` ⇒ sẽ vào queue phiên ôn khi hết thẻ đến hạn
 * (AC-LG-4).
 */
export async function createManualCard(
  input: ManualCardInput,
): Promise<SrsCardDTO> {
  const now = new Date();
  const state = createNewCardState(now);

  const card = await prisma.card.create({
    data: {
      lang: input.lang,
      front: input.front.trim(),
      frontAlt: input.frontAlt?.trim() || null,
      back: input.back.trim(),
      note: input.note?.trim() || null,
      example: input.example?.trim() || null,
      group: input.group?.trim() || null,
      mode: "recall",
      cardState: state as unknown as object,
      // ⚠️ Thẻ mới đến hạn ngay ⇒ vào queue phiên ôn kế tiếp.
      due: now,
      stability: state.stability,
      difficulty: state.difficulty,
    },
    select: {
      id: true,
      lang: true,
      front: true,
      frontAlt: true,
      back: true,
      note: true,
      example: true,
      examplePinyin: true,
      hint: true,
      group: true,
      mode: true,
      due: true,
      reps: true,
      lapses: true,
      stability: true,
      difficulty: true,
      cardState: true,
      createdAt: true,
    },
  });

  return toCardDTO(card, now);
}

/* ══ Xuất / nhập deck (AC-LG-12) ══════════════════════════════════════════ */

/**
 * Xuất deck ra JSON (AC-LG-12).
 */
export async function exportDeck(lang: SrsLang): Promise<{
  schemaVersion: number;
  exportedAt: string;
  lang: SrsLang;
  cards: Array<{
    id: string;
    front: string;
    frontAlt: string | null;
    back: string;
    note: string | null;
    example: string | null;
    group: string | null;
    cardState: unknown;
    due: string;
  }>;
}> {
  const cards = await prisma.card.findMany({
    where: { lang },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      front: true,
      frontAlt: true,
      back: true,
      note: true,
      example: true,
      group: true,
      cardState: true,
      due: true,
    },
  });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    lang,
    cards: cards.map((card) => ({
      id: card.id,
      front: card.front,
      frontAlt: card.frontAlt,
      back: card.back,
      note: card.note,
      example: card.example,
      group: card.group,
      cardState: card.cardState,
      due: card.due.toISOString(),
    })),
  };
}
