/**
 * Rubric cố định của mock interview (P4) + tính điểm.
 *
 * ⚠️ P4 — AI **KHÔNG** được tự nghĩ tiêu chí. Rubric kỹ thuật 5 tiêu chí và
 * rubric hành vi 4 tiêu chí là hằng số ở đây, nhúng nguyên văn vào prompt.
 *
 * Nguồn: `.kiro/specs/mock-interview/spec.md` §3.5 · `design.md` §3.1.
 */

import {
  BEHAVIORAL_RUBRIC_KEYS,
  RUBRIC_KEYS,
  RUBRIC_SCORE_MAX,
  RUBRIC_SCORE_MIN,
  type BehavioralRubricKey,
  type BehavioralScoresJson,
  type CriterionScore,
  type QuestionKind,
  type RubricKey,
  type ScoresJson,
} from "@/lib/interview";

/* ══ Hằng số rubric ══════════════════════════════════════════════════════════ */

export interface RubricCriterion {
  readonly key: RubricKey;
  readonly name: string;
  /** Mô tả — đưa **nguyên văn** vào prompt (spec §3.5). */
  readonly desc: string;
}

export interface BehavioralCriterion {
  readonly key: BehavioralRubricKey;
  readonly name: string;
  readonly desc: string;
}

export const RUBRIC_TECHNICAL: readonly RubricCriterion[] = [
  {
    key: "accuracy",
    name: "Chính xác",
    desc: "Nội dung kỹ thuật đúng, không sai lệch kiến thức nền",
  },
  {
    key: "depth",
    name: "Chiều sâu",
    desc: "Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài",
  },
  {
    key: "reasoning",
    name: "Lập luận",
    desc: "Có chuỗi suy luận rõ ràng từ giả định đến kết luận",
  },
  {
    key: "communication",
    name: "Giao tiếp",
    desc: "Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp",
  },
  {
    key: "tradeoff",
    name: "Nhận biết đánh đổi",
    desc: "Nói được cái giá của lựa chọn và khi nào không dùng",
  },
] as const;

export const RUBRIC_BEHAVIORAL: readonly BehavioralCriterion[] = [
  {
    key: "specific",
    name: "Cụ thể",
    desc: "Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung",
  },
  {
    key: "star",
    name: "Đầy đủ STAR",
    desc: "Rõ tình huống → nhiệm vụ → hành động → kết quả",
  },
  {
    key: "selfaware",
    name: "Tự nhận thức",
    desc: "Nhận ra điều mình làm chưa tốt và vì sao",
  },
  {
    key: "outcome",
    name: "Kết quả",
    desc: "Kết quả có thể đo được, không chỉ là cảm nhận",
  },
] as const;

/** Câu dạng nào dùng rubric nào (design.md §3.1). */
export const RUBRIC_BY_KIND: Record<QuestionKind, "technical" | "behavioral"> = {
  concept: "technical",
  design: "technical",
  debug: "technical",
  tradeoff: "technical",
  behavioral: "behavioral",
};

/** Ngưỡng "đạt" — dùng cho màu thanh tiêu chí ở S18 (spec §6.4). */
export const RUBRIC_PASS_THRESHOLD = 4.0;

/* ══ Sanitize & tính điểm ═══════════════════════════════════════════════════ */

/** Clamp về [0,5] + làm tròn 1 chữ số. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return RUBRIC_SCORE_MIN;
  const clamped = Math.min(RUBRIC_SCORE_MAX, Math.max(RUBRIC_SCORE_MIN, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * Đọc 1 tiêu chí từ payload AI — chấp nhận cả `{score, note}` lẫn mảng
 * `[score, note]` (schema cũ trong `prisma/schema.prisma` ghi `[score,note]`).
 */
function readCriterion(raw: unknown): CriterionScore | null {
  if (raw === null || raw === undefined) return null;

  if (Array.isArray(raw)) {
    const [score, note] = raw;
    if (typeof score !== "number") return null;
    return {
      score: clampScore(score),
      note: typeof note === "string" ? note : "",
    };
  }

  if (typeof raw === "object") {
    const obj = raw as { score?: unknown; note?: unknown };
    if (typeof obj.score !== "number") return null;
    return {
      score: clampScore(obj.score),
      note: typeof obj.note === "string" ? obj.note : "",
    };
  }

  return null;
}

/**
 * Loại key ngoài rubric + clamp điểm về [0,5].
 *
 * ⚠️ Quy tắc 4 & 5 của spec §3.5: AI trả thêm key lạ ⇒ **loại bỏ**; điểm ngoài
 * thang ⇒ clamp. `kind='behavioral'` ⇒ chỉ giữ rubric hành vi.
 *
 * @returns rubric đã chuẩn hoá; thiếu key thì điểm 0 + note giải thích vì sao.
 */
export function sanitizeScores(
  raw: unknown,
  kind: QuestionKind,
): ScoresJson | BehavioralScoresJson {
  const source =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  if (RUBRIC_BY_KIND[kind] === "behavioral") {
    const out = {} as Record<BehavioralRubricKey, CriterionScore>;
    for (const key of BEHAVIORAL_RUBRIC_KEYS) {
      const criterion = readCriterion(source[key]);
      out[key] =
        criterion ?? {
          score: RUBRIC_SCORE_MIN,
          note: "AI không cung cấp tiêu chí này — chấm 0.",
        };
    }
    return out as BehavioralScoresJson;
  }

  const out = {} as Record<RubricKey, CriterionScore>;
  for (const key of RUBRIC_KEYS) {
    const criterion = readCriterion(source[key]);
    out[key] =
      criterion ?? {
        score: RUBRIC_SCORE_MIN,
        note: "AI không cung cấp tiêu chí này — chấm 0.",
      };
  }
  return out as ScoresJson;
}

/**
 * Điểm tổng 1 lượt = trung bình các tiêu chí **đã chấm** (làm tròn 2 chữ số).
 *
 * ⚠️ Không tin `total` do AI trả (task 10.6) — server tự tính.
 * Không có tiêu chí hợp lệ ⇒ trả 0 (không phải `NaN`).
 */
export function computeTurnTotal(
  scores: Partial<ScoresJson> | Partial<BehavioralScoresJson> | null | undefined,
  kind: QuestionKind,
): number {
  if (!scores) return 0;

  const keys: readonly string[] =
    RUBRIC_BY_KIND[kind] === "behavioral" ? BEHAVIORAL_RUBRIC_KEYS : RUBRIC_KEYS;

  const values: number[] = [];
  for (const key of keys) {
    const criterion = (scores as Record<string, CriterionScore | undefined>)[key];
    if (!criterion || typeof criterion.score !== "number") continue;
    values.push(criterion.score);
  }

  if (values.length === 0) return 0;

  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/**
 * Điểm tổng phiên = trung bình điểm tổng các lượt **đã trả lời**.
 * Danh sách rỗng ⇒ `null` (phiên chưa có câu nào).
 */
export function computeSessionTotal(turnTotals: readonly number[]): number | null {
  const values = turnTotals.filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;

  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/**
 * Điểm trung bình của từng tiêu chí rubric trên toàn bộ lượt đã trả lời.
 *
 * ⚠️ Tính lại từ `scores` — không dùng giá trị AI trả (spec §3.6 rule 6).
 * Câu `behavioral` **không** đóng góp vào rubric kỹ thuật.
 */
export function computeSessionRubric(
  turns: ReadonlyArray<{
    readonly kind: QuestionKind;
    readonly scores: unknown;
  }>,
): Record<RubricKey, number> {
  const buckets = new Map<RubricKey, number[]>();

  for (const turn of turns) {
    if (RUBRIC_BY_KIND[turn.kind] !== "technical") continue;
    if (!turn.scores || typeof turn.scores !== "object") continue;

    const source = turn.scores as Record<string, unknown>;
    for (const key of RUBRIC_KEYS) {
      const criterion = readCriterion(source[key]);
      if (!criterion) continue;
      const list = buckets.get(key) ?? [];
      list.push(criterion.score);
      buckets.set(key, list);
    }
  }

  const out = {} as Record<RubricKey, number>;
  for (const key of RUBRIC_KEYS) {
    const values = buckets.get(key) ?? [];
    if (values.length === 0) {
      out[key] = 0;
      continue;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    out[key] = Math.round((sum / values.length) * 100) / 100;
  }
  return out;
}

/* ══ RUBRIC_BLOCK — chuỗi nhúng vào system prompt ══════════════════════════ */

/**
 * Khối rubric cho `system` prompt — **CỐ ĐỊNH**, không timestamp/UUID
 * (tech.md §4.2 — đây là prefix của prompt cache).
 */
export const RUBRIC_BLOCK: string = [
  "KHỐI RUBRIC CỐ ĐỊNH — MOCK INTERVIEW (FR-MI-04 / FR-MI-05)",
  "Chỉ được chấm theo đúng các tiêu chí dưới đây. Mỗi tiêu chí chấm 0–5.",
  "",
  "RUBRIC KỸ THUẬT (áp dụng cho concept/design/debug/tradeoff) — chấm đúng 5 tiêu chí:",
  ...RUBRIC_TECHNICAL.map(
    (c, i) => `${i + 1}. ${c.key} — ${c.name}: ${c.desc}.`,
  ),
  "",
  "RUBRIC HÀNH VI (áp dụng cho behavioral) — chấm đúng 4 tiêu chí:",
  ...RUBRIC_BEHAVIORAL.map(
    (c, i) => `${i + 1}. ${c.key} — ${c.name}: ${c.desc}.`,
  ),
  "",
  "QUY TẮC CHẤM:",
  "- Chỉ chấm theo các tiêu chí liệt kê trên. Không thêm, không đổi, không gộp tiêu chí.",
  "- Mỗi tiêu chí trả {score: 0..5, note: 1..2 câu giải thích cụ thể dựa trên câu trả lời}.",
  "- note phải chỉ ra chi tiết cụ thể trong câu trả lời, không được chung chung.",
  "- total = trung bình các tiêu chí đã chấm (hệ thống tự tính lại, không tin giá trị AI trả).",
  "- Câu trả lời rỗng hoặc không liên quan → điểm 0 cho mọi tiêu chí, note nói rõ vì sao.",
  "- Không chấm thêm tiêu chí nào ngoài danh sách. Không bỏ tiêu chí nào.",
].join("\n");
