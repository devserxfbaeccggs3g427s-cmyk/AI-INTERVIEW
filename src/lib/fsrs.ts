/**
 * Wrapper `ts-fsrs` — thuật toán FSRS thuần, không phụ thuộc Prisma/AI.
 *
 * Nguồn: `.kiro/specs/srs-language-review/design.md` §3.1
 * AC-4: mọi kết quả phải khớp tuyệt đối `scheduler.next(state, now, grade).card`.
 */

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';

/** Ngôn ngữ học được hỗ trợ (P5 — đóng băng 2 ngôn ngữ). */
export type Lang = 'zh' | 'en';

/** 4 mức chấm FSRS — khớp cột `Review.rating` trong SPEC §4. */
export type GradeRating = 1 | 2 | 3 | 4;

/** State FSRS lưu trong `Card.cardState` (JSON). Bọc version để migrate. */
export interface CardState {
  version: 1;
  due: string; // ISO-8601 UTC
  stability: number; // S — độ bền bộ nhớ (ngày)
  difficulty: number; // D — độ khó (1..10)
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number; // 0=New 1=Learning 2=Review 3=Relearning
  lastReview: string | null; // ISO-8601 UTC
}

/** Một mức chấm kèm khoảng cách tới lượt ôn kế tiếp. */
export interface RatingPreview {
  rating: GradeRating;
  /** Khoảng cách tới lượt ôn kế tiếp, tính bằng phút. */
  intervalMinutes: number;
  /** Nhãn đã định dạng cho UI, ví dụ "Lặp lại trong 1 phút" / "Ôn sau 4 ngày". */
  label: string;
  /** ISO-8601 UTC — thời điểm đến hạn của thẻ nếu chấm mức này. */
  due: string;
  /** State FSRS sau khi chấm mức này. */
  card: CardState;
}

/**
 * Tham số FSRS — ĐÓNG BĂNG (R11).
 * Đổi giá trị ở đây = migration toàn bộ lịch đã lưu. Không cho UI sửa.
 */
export const FSRS_CONFIG: FSRSParameters = generatorParameters({
  request_retention: 0.9, // D7 — khớp "Mục tiêu 90%" của prototype S09
  maximum_interval: 365, // D8
  enable_fuzz: false, // D5 — interval tiên đoán được cho test AC-4
  enable_short_term: true, // D14
  learning_steps: ['1m', '10m'], // D6 — khớp nhãn prototype S10
  relearning_steps: ['10m'],
});

/** Scheduler dùng chung — khởi tạo 1 lần, thuần, không state. */
export const scheduler = fsrs(FSRS_CONFIG);

/** Ngưỡng coi thẻ là "đã thuộc" (stable) — dùng cho số liệu S09. */
export const MASTERY_STABILITY_DAYS = 21;

/** Ngưỡng thẻ còn "đang học" (chưa mature). */
export const LEARNING_STABILITY_DAYS = 21;

/** Tạo state thẻ mới (chưa từng ôn) — dùng khi seed và khi thêm thẻ thủ công. */
export function createNewCardState(now: Date = new Date()): CardState {
  return toCardState(createEmptyCard(now));
}

/** Chuyển state FSRS nội bộ → JSON lưu DB. */
export function toCardState(card: FsrsCard): CardState {
  return {
    version: 1,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Chuyển JSON lưu DB → state FSRS nội bộ (phục hồi scheduler). */
export function fromCardState(state: CardState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0, // không dùng cho scheduling, giá trị mặc định
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

/** Ánh xạ rating 1..4 → enum `Rating` của `ts-fsrs`. */
const GRADE_BY_RATING: Record<GradeRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/** Chuyển rating sang enum Grade. */
export function toTsfsrsGrade(rating: GradeRating): Grade {
  return GRADE_BY_RATING[rating];
}

/**
 * Tính preview 4 mức chấm cho 1 thẻ.
 * @param cardState - state hiện tại của thẻ (đọc từ `Card.cardState`)
 * @param now - thời điểm hiện tại
 * @returns Record theo `GradeRating` → preview (thứ tự Again → Easy)
 */
export function previewIntervals(
  cardState: CardState,
  now: Date = new Date(),
): Record<GradeRating, RatingPreview> {
  const preview: Record<GradeRating, RatingPreview> = {} as Record<
    GradeRating,
    RatingPreview
  >;

  for (const rating of [1, 2, 3, 4] as GradeRating[]) {
    const { card } = scheduler.next(
      fromCardState(cardState),
      now,
      toTsfsrsGrade(rating),
    );

    const intervalMinutes = Math.max(
      0,
      Math.round((card.due.getTime() - now.getTime()) / 60_000),
    );

    preview[rating] = {
      rating,
      intervalMinutes,
      label: formatInterval(intervalMinutes, rating),
      due: card.due.toISOString(),
      card: toCardState(card),
    };
  }

  return preview;
}

/**
 * Áp dụng 1 lượt ôn.
 * @returns state mới **đúng** như `scheduler.next(cardState, now, rating)`
 */
export function applyRating(
  cardState: CardState,
  rating: GradeRating,
  now: Date = new Date(),
): { card: CardState; log: ReviewLogSnapshot } {
  const { card, log } = scheduler.next(
    fromCardState(cardState),
    now,
    toTsfsrsGrade(rating),
  );

  return { card: toCardState(card), log: toReviewLogSnapshot(log, now) };
}

/** Snapshot `ReviewLog` để ghi vào `Review.state`. */
export interface ReviewLogSnapshot {
  rating: GradeRating;
  state: number;
  due: string; // ISO-8601 UTC
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  review: string; // ISO-8601 UTC
}

function toReviewLogSnapshot(log: ReviewLog, _now: Date): ReviewLogSnapshot {
  return {
    rating: log.rating as GradeRating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    review: log.review.toISOString(),
  };
}

/**
 * Định dạng khoảng cách cho UI.
 * @param minutes - khoảng cách tới lượt ôn kế tiếp (phút)
 * @param rating - mức chấm; `1` (Again) dùng "Lặp lại trong…", các mức khác dùng "Ôn sau…"
 */
export function formatInterval(minutes: number, rating?: GradeRating): string {
  const prefix = rating === 1 ? 'Lặp lại trong' : 'Ôn sau';

  if (minutes < 1) return 'Ngay bây giờ';
  if (minutes < 60) return `${prefix} ${minutes} phút`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${prefix} ${hours} giờ`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${prefix} ${days} ngày`;
}

/** Tỷ lệ giữ lại bộ nhớ tại thời điểm `now` (0..1) — cho panel chỉ số. */
export function retrievability(cardState: CardState, now: Date = new Date()): number {
  return scheduler.get_retrievability(
    fromCardState(cardState),
    now,
    false,
  );
}

/** Lỗi version state FSRS. */
export class FsrsStateVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FsrsStateVersionError';
  }
}

/** Lỗi state FSRS hỏng. */
export class FsrsStateCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FsrsStateCorruptError';
  }
}

/**
 * Migration state FSRS từ version cũ → version 1.
 * Ném `FsrsStateVersionError` nếu `version !== 1`.
 * Ném `FsrsStateCorruptError` nếu JSON không hợp lệ.
 */
export function migrateCardState(raw: unknown): CardState {
  if (!raw || typeof raw !== 'object') {
    throw new FsrsStateCorruptError('cardState không phải object');
  }

  const state = raw as Partial<CardState>;

  if (typeof state.version !== 'number' || state.version !== 1) {
    throw new FsrsStateVersionError(`Version không hỗ trợ: ${state.version}`);
  }

  // Validate required fields
  if (
    typeof state.due !== 'string' ||
    typeof state.stability !== 'number' ||
    typeof state.difficulty !== 'number' ||
    typeof state.scheduledDays !== 'number' ||
    typeof state.learningSteps !== 'number' ||
    typeof state.reps !== 'number' ||
    typeof state.lapses !== 'number' ||
    typeof state.state !== 'number' ||
    (state.lastReview !== null && typeof state.lastReview !== 'string')
  ) {
    throw new FsrsStateCorruptError('Trường cardState thiếu hoặc sai kiểu');
  }

  return state as CardState;
}

/** Kiểm tra `cardState` có hợp lệ không (không ném lỗi). */
export function isValidCardState(raw: unknown): raw is CardState {
  try {
    migrateCardState(raw);
    return true;
  } catch {
    return false;
  }
}