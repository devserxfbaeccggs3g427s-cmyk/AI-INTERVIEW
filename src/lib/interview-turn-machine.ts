/**
 * State machine của 1 lượt phỏng vấn + quy tắc adaptive (FR-MI-06).
 *
 * ⚠️ `validateTurn` chặn lượt rỗng / sai index / phiên đã pause **trước** khi
 * gọi AI (NFR-05 — lỗi AI không được làm mất câu trả lời).
 *
 * Nguồn: `.kiro/specs/mock-interview/design.md` §3.5.
 */

import {
  RUBRIC_BY_KIND,
  clampScore,
  computeTurnTotal,
  sanitizeScores,
} from "@/lib/interview-rubric";
import type {
  AnswerMode,
  BehavioralScoresJson,
  InterviewLanguage,
  QuestionKind,
  ScoresJson,
  SessionStatus,
} from "@/lib/interview";
import type { TurnResult } from "@/lib/interview-prompts";

/* ══ Validate lượt ═══════════════════════════════════════════════════════════ */

export interface TurnContext {
  readonly sessionId: string;
  /** 1-based. */
  readonly turnIndex: number;
  readonly plannedCount: number;
  readonly askedCount: number;
  readonly status: SessionStatus;
  readonly answerMode: AnswerMode;
  readonly language: InterviewLanguage;
  /** Bật Adaptive Loop (FR-MI-06). */
  readonly adaptive: boolean;
  /** Đo tiếng Anh song song (FR-MI-14). */
  readonly englishClarity: boolean;
}

export type TurnValidation =
  | { readonly ok: true; readonly answer: string }
  | {
      readonly ok: false;
      readonly code:
        | "EMPTY_ANSWER"
        | "SESSION_PAUSED"
        | "INDEX_MISMATCH"
        | "SESSION_DONE"
        | "SESSION_ABANDONED";
      readonly message: string;
    };

/**
 * Kiểm tra tính hợp lệ của lượt trước khi gọi AI.
 *
 * Thứ tự kiểm tra: trạng thái phiên → index → nội dung.
 * - `SESSION_DONE` / `SESSION_ABANDONED` ⇒ phiên không hồi sinh được.
 * - `SESSION_PAUSED` ⇒ phải resume trước.
 * - `INDEX_MISMATCH` ⇒ `turnIndex` không khớp lượt đang chờ.
 * - `EMPTY_ANSWER` ⇒ không gọi AI.
 */
export function validateTurn(ctx: TurnContext, rawAnswer: string): TurnValidation {
  if (ctx.status === "done") {
    return {
      ok: false,
      code: "SESSION_DONE",
      message: "Phiên đã kết thúc — không gửi thêm câu trả lời.",
    };
  }

  if (ctx.status === "abandoned") {
    return {
      ok: false,
      code: "SESSION_ABANDONED",
      message: "Phiên đã bị bỏ — không gửi thêm câu trả lời.",
    };
  }

  if (ctx.status === "paused") {
    return {
      ok: false,
      code: "SESSION_PAUSED",
      message: "Phiên đang tạm dừng — bấm Tiếp tục trước khi gửi.",
    };
  }

  // Câu đang chờ = lượt có `index = askedCount + 1`.
  const expectedIndex = ctx.askedCount + 1;
  if (ctx.turnIndex !== expectedIndex) {
    return {
      ok: false,
      code: "INDEX_MISMATCH",
      message: `Câu này đã được gửi (đang chờ câu ${expectedIndex}).`,
    };
  }

  const answer = rawAnswer.trim();
  if (answer.length === 0) {
    return {
      ok: false,
      code: "EMPTY_ANSWER",
      message: "Câu trả lời trống — hãy trả lời ít nhất một câu.",
    };
  }

  return { ok: true, answer };
}

/* ══ Quy tắc adaptive ═══════════════════════════════════════════════════════ */

/** Ngưỡng `shouldFollowUp` — design.md §3.5. */
export const FOLLOW_UP_THRESHOLDS = {
  /** minScore < 3.0 ⇒ hời hợt rõ ràng. */
  minScore: 3.0,
  /** avgScore < 3.5 ⇒ chưa đạt. */
  avgScore: 3.5,
  /** Tiêu chí "depth" < 2.5 ⇒ thiếu chiều sâu. */
  depth: 2.5,
  /** Tiêu chí "tradeoff" < 2.5 ⇒ thiếu nhận biết đánh đổi. */
  tradeoff: 2.5,
  /** Câu behavioral: "star" < 2.5 ⇒ thiếu cấu trúc STAR. */
  star: 2.5,
} as const;

/** Ngưỡng "đã đủ" — mọi tiêu chí ≥ 3.5 **và** total ≥ 4.2. */
export const ADEQUATE_THRESHOLDS = {
  minCriterion: 3.5,
  total: 4.2,
} as const;

/**
 * Có cần follow-up không?
 *
 * ```
 * FOLLOW_UP nếu minScore < 3.0
 * FOLLOW_UP nếu avgScore < 3.5
 * FOLLOW_UP nếu depth < 2.5
 * FOLLOW_UP nếu tradeoff < 2.5
 * FOLLOW_UP nếu behavioral và star < 2.5
 * KHÔNG follow-up nếu minScore >= 3.5 và avgScore >= 4.2
 * ```
 *
 * @param kind dạng câu — quyết định rubric nào được dùng.
 * @param total điểm tổng lượt (server tự tính).
 */
export function shouldFollowUp(
  scores: ScoresJson | BehavioralScoresJson | null | undefined,
  kind: QuestionKind = "concept",
  total?: number,
): boolean {
  if (!scores) return true;

  const isBehavioral = RUBRIC_BY_KIND[kind] === "behavioral";
  const source = scores as Record<string, { score: number } | undefined>;

  const values = Object.values(source)
    .filter((item): item is { score: number } => Boolean(item))
    .map((item) => item.score);

  if (values.length === 0) return true;

  const minScore = Math.min(...values);
  const avgScore =
    total ?? Math.round((values.reduce((acc, v) => acc + v, 0) / values.length) * 100) / 100;

  // Đã đủ ⇒ chuyển câu mới.
  if (minScore >= ADEQUATE_THRESHOLDS.minCriterion && avgScore >= ADEQUATE_THRESHOLDS.total) {
    return false;
  }

  if (minScore < FOLLOW_UP_THRESHOLDS.minScore) return true;
  if (avgScore < FOLLOW_UP_THRESHOLDS.avgScore) return true;

  if (!isBehavioral) {
    const depth = source.depth?.score;
    const tradeoff = source.tradeoff?.score;
    if (depth !== undefined && depth < FOLLOW_UP_THRESHOLDS.depth) return true;
    if (tradeoff !== undefined && tradeoff < FOLLOW_UP_THRESHOLDS.tradeoff) return true;
  } else {
    const star = source.star?.score;
    if (star !== undefined && star < FOLLOW_UP_THRESHOLDS.star) return true;
  }

  return false;
}

/* ══ Chuẩn hoá kết quả AI-12 ════════════════════════════════════════════════ */

/**
 * Hậu xử lý kết quả AI-12 trước khi ghi DB:
 *
 * 1. `scores` / `behavioralScores` — sanitize theo `kind` (clamp, lọi key lạ).
 * 2. `total` — **server tự tính**, không tin giá trị AI trả.
 * 3. Follow-up thừa (câu vừa rồi đã đạt) ⇒ ép `isFollowUp=false`.
 * 4. `skillId` của câu kế tiếp không thuộc `skillsFocused` ⇒ gắn node yếu kế tiếp.
 * 5. Phiên đã đủ câu ⇒ `nextQuestion = null`.
 */
export function normalizeTurnResult(
  result: TurnResult,
  ctx: TurnContext,
  focusedSkillIds: readonly string[],
  fallbackSkillId: string | null,
  kind: QuestionKind = "concept",
): TurnResult {
  const sanitized = sanitizeScores(result.scores, kind);
  const total = computeTurnTotal(sanitized, kind);

  const next = result.nextQuestion ? { ...result.nextQuestion } : null;

  if (next) {
    // (5) Đủ câu ⇒ không sinh câu kế tiếp.
    if (ctx.askedCount + 1 >= ctx.plannedCount) {
      return {
        scores: sanitized as ScoresJson,
        behavioralScores:
          kind === "behavioral" ? (sanitized as BehavioralScoresJson) : null,
        total,
        feedback: result.feedback,
        nextQuestion: null,
      };
    }

    // (3) AI sinh follow-up nhưng câu vừa rồi đã đạt ⇒ ép câu mới.
    const wantsFollowUp = next.isFollowUp;
    const needFollowUp = shouldFollowUp(sanitized, kind, total);
    const adequate =
      !ctx.adaptive ? true : !needFollowUp;

    if (wantsFollowUp && !adequate) {
      next.isFollowUp = false;
      next.reason = `Câu trước đã đạt chuẩn — chuyển sang node yếu kế tiếp. ${next.reason}`.slice(0, 300);
    }

    // (4) `skillId` không hợp lệ ⇒ gắn node yếu kế tiếp.
    const valid = new Set(focusedSkillIds);
    if (!next.skillId || !valid.has(next.skillId)) {
      next.skillId = fallbackSkillId ?? null;
    }
  }

  return {
    scores: sanitized as ScoresJson,
    behavioralScores: kind === "behavioral" ? (sanitized as BehavioralScoresJson) : null,
    total,
    feedback: result.feedback,
    nextQuestion: next,
  };
}

/* ══ Chuẩn bị payload cho AI ═════════════════════════════════════════════════ */

/** Số ký tự tối đa gửi lên AI cho 1 câu trả lời. */
export const ANSWER_MAX_CHARS = 3000;

/** Số ký tự giữ lại ở đầu khi cắt. */
const HEAD_CHARS = 2000;
/** Số ký tự giữ lại ở đuôi khi cắt. */
const TAIL_CHARS = 500;

/** Dấu hiệu chèn giữa khi cắt. */
export const TRUNCATION_MARKER = "[...bị cắt...]";

/**
 * Cắt câu trả lời quá dài cho AI: giữ 2000 ký tự đầu + 500 ký tự cuối,
 * chèn `[...bị cắt...]` ở giữa.
 *
 * ⚠️ **DB vẫn lưu nguyên văn** — chỉ payload gửi AI bị cắt.
 */
export function buildTurnPromptInput(
  answer: string,
  maxChars: number = ANSWER_MAX_CHARS,
): { answer: string; truncated: boolean } {
  if (answer.length <= maxChars) return { answer, truncated: false };

  const head = Math.max(0, Math.floor(maxChars * (HEAD_CHARS / (HEAD_CHARS + TAIL_CHARS))));
  const tail = Math.max(0, maxChars - head);

  const headPart = answer.slice(0, head);
  const tailPart = tail > 0 ? answer.slice(answer.length - tail) : "";

  return {
    answer: tailPart ? `${headPart}\n${TRUNCATION_MARKER}\n${tailPart}` : `${headPart}\n${TRUNCATION_MARKER}`,
    truncated: true,
  };
}

/* ══ Điểm clarity of expression (FR-MI-14) ═══════════════════════════════════ */

/**
 * Điểm "clarity of expression" — chỉ chạy khi **cả 3** điều kiện đúng:
 * `englishClarity === true` **và** `language === "en"` **và** `answerMode === "voice"`.
 *
 * @returns `null` ở các trường hợp khác ⇒ cột `clarityScore` = null.
 */
export function computeClarityScore(
  answer: string,
  result: Pick<TurnResult, "scores"> | null | undefined,
  ctx?: Pick<TurnContext, "englishClarity" | "language" | "answerMode">,
): number | null {
  if (!ctx) return null;
  if (!ctx.englishClarity) return null;
  if (ctx.language !== "en") return null;
  if (ctx.answerMode !== "voice") return null;

  const trimmed = answer.trim();
  if (trimmed.length === 0) return null;

  // Điểm clarity suy ra từ tiêu chí `communication` của rubric kỹ thuật.
  const communication = (result?.scores as Record<string, { score?: number }> | undefined)
    ?.communication;
  if (!communication || typeof communication.score !== "number") return null;

  return clampScore(communication.score);
}
