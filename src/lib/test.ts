/**
 * Lớp nghiệp vụ thuần cho bài kiểm tra ngoại ngữ (S19–S21).
 *
 * ⚠️ QUY TẮC D1 (design.md §2.5): file này **KHÔNG import** `src/lib/anthropic.ts`.
 * Mọi thứ tính được bằng code (chấm objective, tổng điểm, band level, đẩy thẻ
 * về ôn) KHÔNG được gọi AI. Nhờ vậy S19/S21 dùng được offline và test được
 * không cần network.
 *
 * Nguồn: `.kiro/specs/language-test/spec.md` §3–§5 + `design.md` §3.1.
 */

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { addDays, normalizeDate, toDateKey } from "@/lib/dates";
import { LEVELS, type Level } from "@/lib/types";
import {
  TEST_TOPIC_GROUP_LABELS,
  TEST_TOPIC_GROUPS,
} from "@/lib/test-topics";

// ⚠️ Re-export để các import cũ (`@/lib/test`) vẫn chạy — nhưng Client
// Component phải import từ `@/lib/test-topics` để không kéo `node:crypto`
// vào browser bundle.
export { TEST_TOPIC_GROUPS, TEST_TOPIC_GROUP_LABELS } from "@/lib/test-topics";

/* ══ Kiểu dữ liệu ════════════════════════════════════════════════════════ */

export type Lang = "zh" | "en";
export type TestType = "placement" | "topic" | "benchmark" | "from_content";
export type ItemType =
  | "mc_vocab"
  | "mc_grammar"
  | "cloze"
  | "listening"
  | "writing"
  | "translation";
export type LevelCode = Level;
export type DifficultyBand = 1 | 2 | 3;
export type ErrorGroupKey = "grammar" | "vocab" | "expression" | "context";
export type LanguageStandard = "cefr" | "hsk" | "vendor";

export interface RubricScores {
  grammar: number;
  vocab: number;
  expression: number;
  context: number;
}

export interface ErrorGroups {
  grammar: string[];
  vocab: string[];
  expression: string[];
  context: string[];
}

/** 4 nhóm lỗi — đúng `RUBRIC_LANGUAGE_ERRORS` (P4). */
export const ERROR_GROUP_KEYS: readonly ErrorGroupKey[] = [
  "grammar",
  "vocab",
  "expression",
  "context",
] as const;

export const OBJECTIVE_TYPES: readonly ItemType[] = [
  "mc_vocab",
  "mc_grammar",
  "cloze",
  "listening",
] as const;

export const OPEN_TYPES: readonly ItemType[] = ["writing", "translation"] as const;

export function isOpenType(itemType: ItemType): boolean {
  return OPEN_TYPES.includes(itemType);
}

/* ══ Hằng số cấu hình đề ═════════════════════════════════════════════════ */

/** Số câu theo loại đề — nguồn chân lý `src/lib/config.ts` `TEST_COUNTS`. */
export const TEST_COUNTS: Record<TestType, number> = {
  placement: 25,
  topic: 20,
  benchmark: 40,
  from_content: 10,
};

/** Timer (giây) — `null` = không giới hạn. */
export const TEST_TIMERS_SEC: Partial<Record<TestType, number>> = {
  benchmark: 30 * 60,
  from_content: 15 * 60,
};

/** Phân bố dạng câu chuẩn — tổng khớp `TEST_COUNTS`. */
export const TEST_ITEM_DISTRIBUTION: Record<TestType, ItemType[]> = {
  placement: [
    "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab",
    "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar",
    "cloze", "cloze", "cloze", "cloze", "cloze",
    "listening", "listening", "listening", "listening", "listening",
  ],
  topic: [
    "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab",
    "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar",
    "cloze", "cloze", "cloze", "cloze",
    "translation", "translation", "writing", "writing",
  ],
  benchmark: [
    "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab", "mc_vocab",
    "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar", "mc_grammar",
    "cloze", "cloze", "cloze", "cloze", "cloze", "cloze",
    "listening", "listening", "listening", "listening", "listening", "listening", "listening", "listening",
    "translation", "translation", "translation", "translation",
    "writing", "writing", "writing", "writing",
  ],
  from_content: [
    "mc_vocab", "mc_vocab", "mc_vocab",
    "mc_grammar", "mc_grammar",
    "cloze", "cloze",
    "listening", "listening",
    "writing",
  ],
};

/** Nhóm chủ đề dùng cho đề `topic` (theo group của `Card`). */

/** Nhãn tiếng Việt cho nhóm chủ đề. */

/** Thang CEFR đầy đủ — nguồn chân lý `src/lib/types.ts` `LEVELS`. */
export const LEVEL_ORDER: readonly LevelCode[] = LEVELS;

/* ══ Chuẩn hoá & chấm objective ══════════════════════════════════════════ */

/**
 * Chuẩn hoá chuỗi để so khớp:
 * bỏ khoảng trắng thừa, hạ chữ thường, bỏ dấu câu cuối, bỏ dấu nháy.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:。！？；：]+$/u, "")
    .replace(/^["'“”‘’「」『』]+/u, "")
    .replace(/["'“”‘’「」『』]+$/u, "")
    .trim()
    .toLowerCase();
}

export interface ObjectiveScore {
  isCorrect: boolean;
  normalized: string;
}

/**
 * Chấm 1 câu objective.
 * - `mc_*` / `listening`: so khớp đúng 1 option (theo chuỗi hoặc theo index "A".."D").
 * - `cloze`: so khớp chuẩn hoá, chấp nhận biến thể pinyin (`altAnswers`).
 */
export function scoreObjective(
  item: Pick<ScoredItem, "itemType" | "answer" | "options">,
  userAnswer: string,
  altAnswers: string[] = [],
): ObjectiveScore {
  const normalized = normalizeAnswer(userAnswer);

  if (!normalized) return { isCorrect: false, normalized };
  if (!item.answer) return { isCorrect: false, normalized };

  const expected = normalizeAnswer(item.answer);
  if (!expected) return { isCorrect: false, normalized };

  if (item.itemType === "cloze") {
    const variants = [expected, ...altAnswers.map((alt) => normalizeAnswer(alt))].filter(Boolean);
    return { isCorrect: variants.includes(normalized), normalized };
  }

  // mc_* / listening — chấp nhận cả nội dung option lẫn nhãn "A".."D".
  const optionIndex = item.options?.findIndex((opt) => normalizeAnswer(opt) === expected) ?? -1;
  const expectedLabel =
    optionIndex >= 0 ? String.fromCharCode(65 + optionIndex).toLowerCase() : expected;

  const accepted = new Set([expected, expectedLabel]);
  if (item.options) {
    item.options.forEach((opt, index) => {
      if (normalizeAnswer(opt) === expected) {
        accepted.add(String.fromCharCode(65 + index).toLowerCase());
      }
    });
  }

  return { isCorrect: accepted.has(normalized), normalized };
}

/** Điểm 1 câu: objective = 1/0; tự luận = trung bình 4 nhóm rubric / 10. */
export function itemScore(item: ScoredItem): number {
  if (isOpenType(item.itemType)) {
    if (!item.rubric) return 0;
    return averageRubric(item.rubric) / 10;
  }
  return item.isCorrect === true ? 1 : 0;
}

/** Trung bình 4 nhóm rubric (0–10). */
export function averageRubric(rubric: RubricScores): number {
  const sum =
    rubric.grammar + rubric.vocab + rubric.expression + rubric.context;
  return sum / ERROR_GROUP_KEYS.length;
}

/* ══ Item đã chấm ════════════════════════════════════════════════════════ */

export interface ScoredItem {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  options: string[] | null;
  answer: string | null;
  userAnswer: string | null;
  isCorrect: boolean | null;
  cardId: string | null;
  skillName: string | null;
  errorGroups: ErrorGroups | null;
  rubric: RubricScores | null;
  notes: string | null;
  explanation: string | null;
  seconds: number | null;
  flagged: boolean;
  scored: boolean;
}

export interface ItemTypeStat {
  itemType: ItemType;
  correct: number;
  total: number;
  rate: number;
  status: "good" | "ok" | "weak";
  avgSeconds: number | null;
}

export interface SessionSummary {
  testId: string;
  lang: Lang;
  testType: TestType;
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  durationSec: number;
  byItemType: ItemTypeStat[];
  wrongItems: ScoredItem[];
  levelLocal: LevelCode;
  bottleneck: ItemType | null;
  avgSecondsPerItem: number | null;
}

/** Ngưỡng trạng thái theo tỷ lệ đúng: ≥0.75 Tốt · ≥0.60 Đạt · <0.60 Cần cải thiện. */
export function rateStatus(rate: number): "good" | "ok" | "weak" {
  if (rate >= 0.75) return "good";
  if (rate >= 0.6) return "ok";
  return "weak";
}

/** Tổng hợp kết quả phiên — điểm, phân tách theo dạng, danh sách câu sai. */
export function summarizeSession(
  items: ScoredItem[],
  meta: { testId: string; lang: Lang; testType: TestType; durationSec: number },
): SessionSummary {
  const total = items.length;
  let score = 0;
  let correct = 0;

  const groups = new Map<ItemType, ScoredItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.itemType) ?? [];
    bucket.push(item);
    groups.set(item.itemType, bucket);

    score += itemScore(item);
    if (item.isCorrect === true) correct += 1;
  }

  const byItemType: ItemTypeStat[] = [...groups.entries()].map(
    ([itemType, bucket]) => {
      const bucketCorrect = bucket.filter((i) => i.isCorrect === true).length;
      const times = bucket
        .map((i) => i.seconds)
        .filter((s): s is number => typeof s === "number");
      return {
        itemType,
        correct: bucketCorrect,
        total: bucket.length,
        rate: bucket.length === 0 ? 0 : bucketCorrect / bucket.length,
        status: rateStatus(bucket.length === 0 ? 0 : bucketCorrect / bucket.length),
        avgSeconds:
          times.length === 0
            ? null
            : Math.round(times.reduce((sum, s) => sum + s, 0) / times.length),
      };
    },
  );

  const wrongItems = items.filter((item) => item.isCorrect === false);
  const allTimes = items
    .map((i) => i.seconds)
    .filter((s): s is number => typeof s === "number");

  const { level, bottleneck } = estimateLevelLocal(byItemType, score, total);

  return {
    testId: meta.testId,
    lang: meta.lang,
    testType: meta.testType,
    score: round2(score),
    maxScore: total,
    correct,
    total,
    durationSec: meta.durationSec,
    byItemType,
    wrongItems,
    levelLocal: level,
    bottleneck,
    avgSecondsPerItem:
      allTimes.length === 0
        ? null
        : Math.round(allTimes.reduce((sum, s) => sum + s, 0) / allTimes.length),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ══ Ước lượng level cục bộ ═══════════════════════════════════════════════ */

/**
 * Ngưỡng điểm cố định (KHÔNG do AI quyết định):
 *   zero : không dạng nào ≥ 0.60
 *   A1   : tỷ lệ đúng chung ≥ 0.60
 *   A2   : ≥ 0.75 · B1 : ≥ 0.85 · B2 : ≥ 0.92 · C1 : ≥ 0.97 · C2 : ≥ 0.99
 * Mỗi bậc cộng điều kiện: không dạng nào < 0.40 (nếu có → trừ 1 bậc).
 */
const LEVEL_THRESHOLDS: ReadonlyArray<readonly [LevelCode, number]> = [
  ["C2", 0.99],
  ["C1", 0.97],
  ["B2", 0.92],
  ["B1", 0.85],
  ["A2", 0.75],
  ["A1", 0.6],
];

export function estimateLevelLocal(
  byItemType: ItemTypeStat[],
  score: number,
  maxScore: number,
): { level: LevelCode; bottleneck: ItemType | null } {
  if (byItemType.length === 0 || maxScore <= 0) {
    return { level: "zero", bottleneck: null };
  }

  const overall = score / maxScore;
  const worst = byItemType.reduce((min, stat) =>
    stat.rate < min.rate ? stat : min,
  );
  const bottleneck: ItemType | null = worst.total > 0 ? worst.itemType : null;

  let index = LEVEL_THRESHOLDS.findIndex(([, threshold]) => overall >= threshold);
  if (index === -1) index = LEVEL_THRESHOLDS.length;

  // index = 0 ⇒ C2, index = 5 ⇒ A1, index = 6 ⇒ zero.
  let levelIndex = LEVEL_THRESHOLDS.length - index;

  // Có dạng < 40% ⇒ trừ 1 bậc (LEVEL_ORDER index giảm 1 vì "zero" là bậc thấp nhất).
  if (byItemType.some((stat) => stat.total > 0 && stat.rate < 0.4)) {
    levelIndex -= 1;
  }

  const clamped = Math.min(levelIndex, LEVEL_ORDER.length - 1);
  return { level: LEVEL_ORDER[clamped] ?? "zero", bottleneck };
}

/**
 * Kéo level về gần band code: AI lệch > 1 bậc ⇒ dùng band code (LT-R6).
 */
export function clampLevel(level: LevelCode, target: LevelCode): LevelCode {
  const levelIndex = LEVEL_ORDER.indexOf(level);
  const targetIndex = LEVEL_ORDER.indexOf(target);
  if (levelIndex === -1 || targetIndex === -1) return target;
  if (Math.abs(levelIndex - targetIndex) <= 1) return level;
  return target;
}

/** Nhãn hiển thị level theo ngôn ngữ (tiếng Trung hiện HSK). */
export function levelLabel(lang: Lang, level: LevelCode): string {
  const HSK_BY_CEFR: Record<LevelCode, string> = {
    zero: "HSK 0",
    A1: "HSK 1",
    A2: "HSK 2",
    B1: "HSK 3",
    B2: "HSK 4",
    C1: "HSK 5",
    C2: "HSK 6",
  };
  if (lang === "zh") return HSK_BY_CEFR[level];
  return `CEFR ${level}`;
}

/** HSK tương ứng với CEFR (chỉ tiếng Trung). */
export function hskForLevel(level: LevelCode): string {
  const HSK_BY_CEFR: Record<LevelCode, string> = {
    zero: "HSK 0",
    A1: "HSK 1",
    A2: "HSK 2",
    B1: "HSK 3",
    B2: "HSK 4",
    C1: "HSK 5",
    C2: "HSK 6",
  };
  return HSK_BY_CEFR[level];
}

/* ══ Band độ khó & parallel form ═════════════════════════════════════════ */

/**
 * Gán band độ khó:
 * - band 3 nếu thẻ yếu (`lapses >= 2` hoặc `difficulty >= 7`)
 * - band 2 nếu trung bình (`stability` thấp hoặc `lapses >= 1`)
 * - band 1 còn lại (thẻ mạnh).
 */
export function assignBand(card: {
  lapses: number;
  difficulty: number;
  stability: number;
}): DifficultyBand {
  if (card.lapses >= 2 || card.difficulty >= 7) return 3;
  if (card.lapses >= 1 || card.stability < 5) return 2;
  return 1;
}

/**
 * Parallel form: sha256 của `itemTypes` đã sort + `bands` → 8 ký tự hex.
 * Hai đề cùng độ khó ⇒ cùng signature ⇒ điểm so sánh được (FR-LT-12).
 */
export function parallelFormSignature(
  itemTypes: ItemType[],
  bands: Record<string, DifficultyBand>,
  standard: LanguageStandard = "cefr",
): string {
  const types = [...itemTypes].sort().join(",");
  const bandKeys = Object.keys(bands).sort();
  const bandPart = bandKeys.map((key) => `${key}:${bands[key]}`).join(",");
  return createHash("sha256")
    .update(`${standard}|${types}|${bandPart}`)
    .digest("hex")
    .slice(0, 8);
}

/* ══ Blueprint ═══════════════════════════════════════════════════════════ */

export interface Blueprint {
  lang: Lang;
  testType: TestType;
  topic: string | null;
  level: LevelCode;
  standard: LanguageStandard;
  itemTypes: ItemType[];
  count: number;
  difficultyBands: Partial<Record<ItemType, DifficultyBand>>;
  formSignature: string;
  cardIds: string[];
  seedBankUsed: number;
  userCardUsed: number;
  reused: boolean;
  sourceText: string | null;
  excludeSessionIds: string[];
}

export interface PickedCard {
  cardId: string;
  front: string;
  frontAlt: string | null;
  back: string;
  band: DifficultyBand;
  group: string | null;
}

/**
 * Thẻ đã dùng trong `sessionCount` phiên gần nhất cùng `lang` (R10).
 */
export async function getRecentlyUsedCardIds(
  lang: Lang,
  sessionCount = 3,
): Promise<{ cardIds: string[]; sessionIds: string[] }> {
  const sessions = await prisma.testSession.findMany({
    where: { lang },
    orderBy: { createdAt: "desc" },
    take: sessionCount,
    select: { id: true, items: { select: { cardId: true } } },
  });

  const cardIds = new Set<string>();
  for (const session of sessions) {
    for (const item of session.items) {
      if (item.cardId) cardIds.add(item.cardId);
    }
  }

  return {
    cardIds: [...cardIds],
    sessionIds: sessions.map((s) => s.id),
  };
}

/**
 * Chọn thẻ yếu của chính người dùng (FR-LT-10):
 * `lapses DESC, difficulty DESC, stability ASC`, lọc `excludeCardIds`.
 */
export async function pickWeakCards(opts: {
  lang: Lang;
  topic: string | null;
  limit: number;
  excludeCardIds: string[];
}): Promise<PickedCard[]> {
  const where = {
    lang: opts.lang,
    ...(opts.topic ? { group: opts.topic } : {}),
    id: { notIn: opts.excludeCardIds },
  };

  const rows = await prisma.card.findMany({
    where,
    orderBy: [{ lapses: "desc" }, { difficulty: "desc" }, { stability: "asc" }],
    take: opts.limit,
    select: {
      id: true,
      front: true,
      frontAlt: true,
      back: true,
      group: true,
      lapses: true,
      difficulty: true,
      stability: true,
    },
  });

  return rows.map((row) => ({
    cardId: row.id,
    front: row.front,
    frontAlt: row.frontAlt,
    back: row.back,
    group: row.group,
    band: assignBand(row),
  }));
}

/**
 * Bù từ ngân hàng seed khi thẻ người dùng không đủ.
 *
 * ⚠️ Ngân hàng seed = các thẻ `Card` còn lại (không phải thẻ vừa dùng) —
 * đề **không bao giờ** để AI sinh từ mới (FR-LT-10, R6).
 */
export async function pickSeedCards(opts: {
  lang: Lang;
  topic: string | null;
  limit: number;
  excludeCardIds: string[];
}): Promise<PickedCard[]> {
  const where = {
    lang: opts.lang,
    ...(opts.topic ? { group: opts.topic } : {}),
    id: { notIn: opts.excludeCardIds },
  };

  const rows = await prisma.card.findMany({
    where,
    orderBy: [{ lapses: "asc" }, { difficulty: "asc" }],
    take: opts.limit,
    select: {
      id: true,
      front: true,
      frontAlt: true,
      back: true,
      group: true,
      lapses: true,
      difficulty: true,
      stability: true,
    },
  });

  return rows.map((row) => ({
    cardId: row.id,
    front: row.front,
    frontAlt: row.frontAlt,
    back: row.back,
    group: row.group,
    band: assignBand(row),
  }));
}

/**
 * Dựng blueprint đầy đủ cho 1 loại đề (FR-LT-10, FR-LT-12).
 *
 * Thứ tự nguồn item:
 *   1. thẻ người dùng yếu trước (loại cardId đã dùng 3 phiên gần nhất)
 *   2. bù từ ngân hàng seed
 *   3. dạng câu không cần thẻ (`mc_grammar` tổng quát) — AI sinh cách hỏi.
 */
export async function buildBlueprint(opts: {
  lang: Lang;
  testType: TestType;
  topic: string | null;
  level: LevelCode;
  count: number;
  itemTypes: ItemType[];
  standard?: LanguageStandard;
  sourceText?: string | null;
}): Promise<Blueprint> {
  const standard = opts.standard ?? "cefr";
  const recent = await getRecentlyUsedCardIds(opts.lang, 3);

  const needCards = opts.itemTypes.filter((type) => type !== "mc_grammar").length;
  const weak = await pickWeakCards({
    lang: opts.lang,
    topic: opts.topic,
    limit: needCards,
    excludeCardIds: recent.cardIds,
  });

  const usedIds = new Set(weak.map((c) => c.cardId));
  let seedBankUsed = 0;

  if (weak.length < needCards) {
    const seed = await pickSeedCards({
      lang: opts.lang,
      topic: opts.topic,
      limit: needCards - weak.length,
      excludeCardIds: [...recent.cardIds, ...usedIds],
    });
    for (const card of seed) {
      if (!usedIds.has(card.cardId)) {
        usedIds.add(card.cardId);
        seedBankUsed += 1;
      }
    }
  }

  const cardIds = [...usedIds];
  const reused = cardIds.length < needCards;

  // Band theo dạng: dùng band trung bình của các thẻ đã chọn.
  const bands: Partial<Record<ItemType, DifficultyBand>> = {};
  const picked = weak.filter((c) => usedIds.has(c.cardId));
  for (const itemType of opts.itemTypes) {
    const related = picked.filter((_, index) => index % 4 === itemTypeIndex(itemType));
    if (related.length === 0) {
      bands[itemType] = 1;
      continue;
    }
    const avg =
      related.reduce((sum, c) => sum + c.band, 0) / related.length;
    bands[itemType] = avg >= 2.5 ? 3 : avg >= 1.5 ? 2 : 1;
  }

  const formSignature = parallelFormSignature(
    opts.itemTypes,
    bands as Record<string, DifficultyBand>,
    standard,
  );

  return {
    lang: opts.lang,
    testType: opts.testType,
    topic: opts.topic,
    level: opts.level,
    standard,
    itemTypes: opts.itemTypes,
    count: opts.count,
    difficultyBands: bands,
    formSignature,
    cardIds,
    seedBankUsed,
    userCardUsed: cardIds.length - seedBankUsed,
    reused,
    sourceText: opts.sourceText ?? null,
    excludeSessionIds: recent.sessionIds,
  };
}

function itemTypeIndex(itemType: ItemType): number {
  return ITEM_TYPE_ORDER.indexOf(itemType);
}

const ITEM_TYPE_ORDER: ItemType[] = [
  "mc_vocab",
  "mc_grammar",
  "cloze",
  "listening",
  "writing",
  "translation",
];

/* ══ Giải thích & gợi ý ══════════════════════════════════════════════════ */

/** Giải thích ngắn cho 1 câu objective sai. */
export function buildObjectiveExplanation(item: {
  itemType: ItemType;
  answer: string | null;
  options: string[] | null;
}): string {
  if (!item.answer) return "Đề chưa có đáp án đúng — không chấm được câu này.";

  if (item.itemType === "cloze") {
    return `Đáp án đúng là “${item.answer}”. Hãy nhớ chính tả và âm thanh của từ.`;
  }

  const options = item.options ?? [];
  const index = options.findIndex((opt) => normalizeAnswer(opt) === normalizeAnswer(item.answer ?? ""));
  if (index >= 0) {
    return `Đáp án đúng là ${String.fromCharCode(65 + index)} — “${options[index]}”.`;
  }

  return `Đáp án đúng là “${item.answer}”.`;
}

/** Gợi ý nhóm từ + bài tập đầu tiên sau placement (FR-LT-07). */
export function suggestedGroupForLevel(
  lang: Lang,
  level: LevelCode,
): {
  group: string;
  groupLabel: string;
  firstTask: { title: string; minutes: number; href: string };
} {
  const order = TEST_TOPIC_GROUPS[lang];
  const levelIndex = LEVEL_ORDER.indexOf(level);

  // Level cao hơn ⇒ bắt đầu từ nhóm cơ bản hơn.
  const offset = Math.min(order.length - 1, Math.max(0, Math.floor(levelIndex / 2)));
  const group = order[offset] ?? order[0] ?? "greet";
  const groupLabel = TEST_TOPIC_GROUP_LABELS[group] ?? group;

  return {
    group,
    groupLabel,
    firstTask: {
      title: `Ôn 10 thẻ nhóm “${groupLabel}”`,
      minutes: 10,
      href: `/language?group=${group}`,
    },
  };
}

/* ══ Ghi DB: Activity + Evidence + profile level ═════════════════════════ */

/** Skill ngôn ngữ tương ứng với `lang` — node tầng 2 trong cây kỹ năng. */
export const LANGUAGE_SKILL_IDS: Record<Lang, string> = {
  zh: "skill-lang-zh",
  en: "skill-lang-en",
};

export interface TestEvidenceResult {
  activityId: string;
  evidenceId: string | null;
  skillId: string | null;
}

/**
 * Tạo `Activity` (domain `language`, type `test`) + `Evidence` (FR-LT-11).
 *
 * ⚠️ Evidence chỉ tạo khi skill ngôn ngữ tồn tại — không crash nếu cây kỹ năng
 * chưa có node đó.
 */
export async function createTestEvidence(input: {
  lang: Lang;
  testType: TestType;
  topic: string | null;
  minutes: number;
  aiScore: number;
  pushedCount: number;
  activityId?: string;
}): Promise<TestEvidenceResult> {
  const skillId = await resolveLanguageSkillId(input.lang);

  const activity = await prisma.activity.create({
    data: {
      skillId,
      domain: "language",
      type: "test",
      minutes: input.minutes,
      title: buildActivityTitle(input.lang, input.testType, input.topic),
      content:
        `Bài kiểm tra ${input.testType}` +
        (input.topic ? ` · chủ đề ${input.topic}` : "") +
        ` · điểm ${input.aiScore.toFixed(2)}` +
        ` · ${input.pushedCount} thẻ bị đẩy về ôn hôm nay`,
      quality: null,
      aiScore: input.aiScore,
      language: input.lang,
    },
    select: { id: true },
  });

  let evidenceId: string | null = null;
  if (skillId) {
    // Chỉ tạo Evidence khi đạt chuẩn nghiệm thu P3 (rating >= 3).
    const rating = input.aiScore >= 0.6 ? 3 : 2;
    if (rating >= 3) {
      const evidence = await prisma.evidence.create({
        data: {
          activityId: activity.id,
          skillId,
          rating,
        },
        select: { id: true },
      });
      evidenceId = evidence.id;
    }
  }

  return { activityId: activity.id, evidenceId, skillId };
}

function buildActivityTitle(
  lang: Lang,
  testType: TestType,
  topic: string | null,
): string {
  const langLabel = lang === "zh" ? "Tiếng Trung" : "Tiếng Anh";
  const typeLabel: Record<TestType, string> = {
    placement: "Định vị",
    topic: "Chủ đề",
    benchmark: "Chuẩn",
    from_content: "Nội dung thực tế",
  };
  return `Bài kiểm tra ${typeLabel[testType]} — ${langLabel}${topic ? ` (${topic})` : ""}`;
}

/** Skill ngôn ngữ theo `lang`; `null` nếu cây kỹ năng chưa có. */
export async function resolveLanguageSkillId(lang: Lang): Promise<string | null> {
  const preferred = LANGUAGE_SKILL_IDS[lang];
  const skill = await prisma.skill.findFirst({
    where: {
      domain: "language",
      ...(preferred ? { OR: [{ id: preferred }, { name: preferred }] } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (skill) return skill.id;

  const fallback = await prisma.skill.findFirst({
    where: { domain: "language" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return fallback?.id ?? null;
}

/**
 * Ghi `UserProfile.zhLevel` / `enLevel` — **chỉ** gọi cho `placement` (FR-LT-07).
 */
export async function setProfileLevel(lang: Lang, level: LevelCode): Promise<void> {
  const data = lang === "zh" ? { zhLevel: level } : { enLevel: level };
  await prisma.userProfile.updateMany({ data });
}

/* ══ Truy vấn phụ trợ cho S19 / S21 ═══════════════════════════════════════ */

export interface PushedCardSummary {
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

/**
 * Thẻ bị đẩy về ôn của 1 phiên — đọc `Card` của các câu sai.
 * Thẻ đã xoá ⇒ bỏ qua, không crash.
 */
export async function getPushedCardsForSession(
  testId: string,
): Promise<PushedCardSummary[]> {
  const items = await prisma.testItem.findMany({
    where: { testId, isCorrect: false, cardId: { not: null } },
    orderBy: { index: "asc" },
    select: {
      index: true,
      itemType: true,
      cardId: true,
      userAnswer: true,
      flagged: true,
    },
  });

  const seen = new Set<string>();
  const targets: Array<{ index: number; itemType: ItemType; cardId: string }> = [];

  for (const item of items) {
    if (!item.cardId || seen.has(item.cardId)) continue;
    // Câu bỏ trống hoặc chỉ gắn cờ ⇒ không phải bằng chứng quên (LT-R9).
    if (!item.userAnswer || item.userAnswer.trim() === "") continue;
    if (item.flagged) continue;
    seen.add(item.cardId);
    targets.push({
      index: item.index,
      itemType: item.itemType as ItemType,
      cardId: item.cardId,
    });
  }

  if (targets.length === 0) return [];

  const cards = await prisma.card.findMany({
    where: { id: { in: targets.map((t) => t.cardId) } },
    select: {
      id: true,
      front: true,
      frontAlt: true,
      back: true,
      due: true,
      lapses: true,
      stability: true,
      difficulty: true,
      cardState: true,
    },
  });

  const cardMap = new Map(cards.map((c) => [c.id, c]));

  return targets.flatMap((target) => {
    const card = cardMap.get(target.cardId);
    if (!card) return []; // thẻ đã xoá → bỏ qua, không crash
    return [
      {
        cardId: card.id,
        front: card.front,
        frontAlt: card.frontAlt,
        back: card.back,
        due: toDateKey(card.due),
        lapses: card.lapses,
        stability: card.stability,
        difficulty: card.difficulty,
        retrievability: 0,
        reason: `Câu ${String(target.index + 1).padStart(2, "0")} — ${target.itemType}`,
      },
    ];
  });
}

/** Đếm số thẻ bị đẩy về ôn hôm nay (do bài kiểm tra đẩy). */
export async function getPushedCardCountToday(lang: Lang): Promise<number> {
  return prisma.testItem.count({
    where: {
      isCorrect: false,
      flagged: false,
      userAnswer: { not: null },
      cardId: { not: null },
      test: { lang, status: { in: ["done", "expired"] } },
    },
  });
}

/** Ngày hôm nay 00:00 local (dùng cho `due = hôm nay`). */
export function startOfToday(now: Date = new Date()): Date {
  return normalizeDate(now);
}

/** Cộng ngày — re-export để tầng nghiệp vụ không phụ thuộc trực tiếp `dates.ts`. */
export { addDays };
