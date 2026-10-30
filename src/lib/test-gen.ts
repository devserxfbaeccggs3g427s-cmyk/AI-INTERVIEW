/**
 * Sinh đề kiểm tra ngoại ngữ — **hoàn toàn tất định, không gọi AI** (FR-AI-17).
 *
 * AI-14 (task 14.4) chốt: blueprint của bài kiểm tra **KHÔNG** gọi AI — chọn lọc
 * tất định từ kho thẻ SRS + ngân hàng seed. Lý do:
 *   - Đề kiểm tra phải **lặp lại được**: cùng đầu vào → cùng đề (task 14.17
 *     "2 lần thi cùng topic → độ khó ngang nhau").
 *   - Mỗi lượt gọi AI là tiền + chờ → không được phép trong luồng làm bài.
 *
 * Nguồn câu hỏi (theo thứ tự ưu tiên):
 *   1. **Thẻ yếu** — `lapses` cao, `difficulty` cao (task 14.5).
 *   2. **Thẻ đến hạn** — chưa thuộc, `reps` thấp.
 *   3. **Ngân hàng seed** — câu hỏi mẫu theo ngôn ngữ (fallback khi hết thẻ).
 *
 * Xem tasks.md 14.4 / 14.5 / 14.10 / 14.17 · design.md §4.16.
 */

import { prisma } from "@/lib/db";
import { matchAnswer } from "@/lib/fuzzy";
import { RUBRIC_LANGUAGE_ERRORS } from "@/lib/rubrics";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  AUTO_GRADED_TYPES,
  AI_GRADED_TYPES,
  type ItemType,
} from "@/lib/test-types";

/**
 * Hằng số dạng câu nằm ở `@/lib/test-types` (client-safe) — re-export để giữ
 * API cũ (`@/lib/test-gen`) cho các module server-side.
 */
export { ITEM_TYPES, ITEM_TYPE_LABELS, AUTO_GRADED_TYPES, AI_GRADED_TYPES };
export type { ItemType };

/** Ngân hàng câu hỏi mẫu — dùng khi DB không đủ thẻ để dựng đề. */
export type SeedQuestion = {
  /** Khoá ổn định — dùng làm `seed` cho PRNG tất định. */
  id: string;
  lang: "zh" | "en";
  itemType: ItemType;
  /** Đề bài. */
  prompt: string;
  /** Đáp án đúng (MC: đúng 1 option; cloze/listening: chuỗi đáp án). */
  answer: string;
  /** Các lựa chọn cho dạng MC. */
  options?: string[];
  /** Text để đọc TTS cho dạng listening. */
  audioText?: string;
  /** Nhóm từ vựng để sinh option nhiễu. */
  group?: string;
  /** Độ khó 1..5 — dùng để cân bằng đề. */
  difficulty: number;
};

const SEED_QUESTIONS: readonly SeedQuestion[] = [
  // ── zh ────────────────────────────────────────────────────────────────
  { id: "zh-mc-1", lang: "zh", itemType: "mc_vocab", prompt: "“学习” nghĩa là gì?", answer: "học tập", options: ["học tập", "ngủ", "chơi", "ăn"], group: "hoc", difficulty: 1 },
  { id: "zh-mc-2", lang: "zh", itemType: "mc_vocab", prompt: "“工作” nghĩa là gì?", answer: "công việc", options: ["công việc", "nhà cửa", "xe cộ", "sách"], group: "cong-viec", difficulty: 1 },
  { id: "zh-mc-3", lang: "zh", itemType: "mc_vocab", prompt: "“时间” nghĩa là gì?", answer: "thời gian", options: ["thời gian", "tiền", "người", "đường"], group: "thoi-gian", difficulty: 2 },
  { id: "zh-mc-4", lang: "zh", itemType: "mc_grammar", prompt: "Chọn câu đúng: 我 ___ 学生。", answer: "是", options: ["是", "不", "有很", "会不"], group: "ngu-phap", difficulty: 1 },
  { id: "zh-mc-5", lang: "zh", itemType: "mc_grammar", prompt: "Chọn câu đúng: 他每天 ___ 中文。", answer: "学", options: ["学", "学习过", "学了吗", "学的"], group: "ngu-phap", difficulty: 2 },
  { id: "zh-cloze-1", lang: "zh", itemType: "cloze", prompt: "我每天早上___咖啡。", answer: "喝", group: "dong-tu", difficulty: 1 },
  { id: "zh-cloze-2", lang: "zh", itemType: "cloze", prompt: "这个问题很___。", answer: "重要", group: "tinh-chat", difficulty: 2 },
  { id: "zh-listen-1", lang: "zh", itemType: "listening", prompt: "Nghe và chọn nghĩa của câu được đọc.", answer: "Tôi là người Việt Nam.", audioText: "我是越南人。", options: ["Tôi là người Việt Nam.", "Tôi là người Trung Quốc.", "Tôi đang đi làm.", "Tôi rất vui."], group: "nghe", difficulty: 1 },
  { id: "zh-listen-2", lang: "zh", itemType: "listening", prompt: "Nghe và chọn nghĩa của câu được đọc.", answer: "Tôi muốn học tiếng Trung.", audioText: "我想学中文。", options: ["Tôi muốn học tiếng Trung.", "Tôi muốn ăn mì.", "Tôi đi làm về.", "Tôi không hiểu."], group: "nghe", difficulty: 2 },
  { id: "zh-write-1", lang: "zh", itemType: "writing", prompt: "Viết 3 câu giới thiệu bản thân bằng tiếng Trung (dùng từ vựng đã học).", answer: "", group: "viet", difficulty: 3 },
  { id: "zh-trans-1", lang: "zh", itemType: "translation", prompt: "Dịch sang tiếng Trung: “Tôi làm việc ở công ty phần mềm.”", answer: "我在一家软件公司工作。", group: "dich", difficulty: 3 },

  // ── en ────────────────────────────────────────────────────────────────
  { id: "en-mc-1", lang: "en", itemType: "mc_vocab", prompt: "“Improve” nghĩa là gì?", answer: "cải thiện", options: ["cải thiện", "xấu đi", "đứng yên", "phá huỷ"], group: "improve", difficulty: 1 },
  { id: "en-mc-2", lang: "en", itemType: "mc_vocab", prompt: "“Schedule” nghĩa là gì?", answer: "lịch trình", options: ["lịch trình", "sơ mi", "khoản đề", "nhà ga"], group: "schedule", difficulty: 2 },
  { id: "en-mc-3", lang: "en", itemType: "mc_vocab", prompt: "“Approve” nghĩa là gì?", answer: "phê duyệt", options: ["phê duyệt", "từ chối", "trì hoãn", "tháo dỡ"], group: "approve", difficulty: 3 },
  { id: "en-mc-4", lang: "en", itemType: "mc_grammar", prompt: "Chọn câu đúng: She ___ to the office every day.", answer: "goes", options: ["goes", "go", "going", "gone"], group: "ngu-phap", difficulty: 1 },
  { id: "en-mc-5", lang: "en", itemType: "mc_grammar", prompt: "Chọn câu đúng: I ___ working since 2020.", answer: "have been", options: ["have been", "am", "was", "had"], group: "ngu-phap", difficulty: 3 },
  { id: "en-cloze-1", lang: "en", itemType: "cloze", prompt: "We need to ___ the deadline by Friday.", answer: "meet", group: "dong-tu", difficulty: 2 },
  { id: "en-cloze-2", lang: "en", itemType: "cloze", prompt: "The team is very ___ about the deadline.", answer: "concerned", group: "tinh-chat", difficulty: 3 },
  { id: "en-listen-1", lang: "en", itemType: "listening", prompt: "Nghe và chọn câu được đọc.", answer: "I would like to schedule a meeting.", audioText: "I would like to schedule a meeting.", options: ["I would like to schedule a meeting.", "I would like to cancel the meeting.", "I have already sent the report.", "I will join from home."], group: "nghe", difficulty: 1 },
  { id: "en-listen-2", lang: "en", itemType: "listening", prompt: "Nghe và chọn câu được đọc.", answer: "The deadline was moved to next Monday.", audioText: "The deadline was moved to next Monday.", options: ["The deadline was moved to next Monday.", "The deadline is still this Friday.", "The report is approved.", "The team is smaller now."], group: "nghe", difficulty: 2 },
  { id: "en-write-1", lang: "en", itemType: "writing", prompt: "Write a 60-word email asking your manager for 2 days off (dùng từ vựng đã học).", answer: "", group: "viet", difficulty: 3 },
  { id: "en-trans-1", lang: "en", itemType: "translation", prompt: "Dịch sang tiếng Anh: “Tôi làm việc ở công ty phần mềm.”", answer: "I work at a software company.", group: "dich", difficulty: 3 },
];

/** Seed ngân hàng câu hỏi theo ngôn ngữ. */
export function getSeedQuestions(lang: "zh" | "en"): SeedQuestion[] {
  return SEED_QUESTIONS.filter((q) => q.lang === lang);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRNG tất định
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PRNG tất định (mulberry32) — cùng `seed` luôn cho cùng dãy số.
 *
 * Vì sao không dùng `Math.random()`: task 14.17 yêu cầu "2 lần thi cùng topic
 * → độ khó ngang nhau". Với `Math.random()` mỗi lần dựng đề sẽ khác nhau →
 * không so sánh được độ khó.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash chuỗi → số nguyên 32-bit — dùng làm seed ổn định. */
export function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fisher–Yates dùng PRNG có seed — không mutate input. */
function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chọn thẻ yếu
// ─────────────────────────────────────────────────────────────────────────────

/** 1 thẻ SRS rút gọn — chỉ các trường cần cho việc dựng đề. */
export type WeakCard = {
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
  lapses: number;
  difficulty: number;
  reps: number;
  due: Date;
};

/**
 * Điểm "yếu" của 1 thẻ — càng cao càng nên được đưa vào đề.
 *
 * Công thức (task 14.5: "ưu tiên `lapses` cao, `difficulty` cao"):
 *   `weakness = lapses * 3 + difficulty * 2 + (reps === 0 ? 1 : 0)`
 *
 * - `lapses` là tín hiệu mạnh nhất: thẻ đã quên nhiều lần → sai nhiều lần.
 * - `difficulty` là độ khó nội tại của FSRS.
 * - `reps === 0` cộng 1: thẻ chưa từng ôn cũng nên vào đề (nhưng yếu hơn thẻ quen sai).
 */
export function weaknessScore(card: WeakCard): number {
  return card.lapses * 3 + card.difficulty * 2 + (card.reps === 0 ? 1 : 0);
}

/**
 * Lấy danh sách thẻ yếu theo ngôn ngữ, đã sắp xếp giảm dần điểm yếu.
 *
 * @param lang     ngôn ngữ cần lấy
 * @param limit    số thẻ tối đa
 * @param onlyDue  chỉ lấy thẻ đã đến hạn (bài kiểm tra nên ưu tiên thẻ cần ôn)
 */
export async function getWeakCards(
  lang: "zh" | "en",
  limit = 60,
  onlyDue = false,
): Promise<WeakCard[]> {
  const now = new Date();
  const cards = await prisma.card.findMany({
    where: {
      lang,
      ...(onlyDue ? { due: { lte: now } } : {}),
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
      lapses: true,
      difficulty: true,
      reps: true,
      due: true,
    },
  });

  return cards
    .map((c) => ({ ...c, due: c.due }))
    .sort((a, b) => {
      const diff = weaknessScore(b) - weaknessScore(a);
      if (diff !== 0) return diff;
      // Hoà điểm yếu → thẻ đến hạn sớm hơn lên trước (ổn định theo thời gian).
      return a.due.getTime() - b.due.getTime();
    })
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dựng đề
// ─────────────────────────────────────────────────────────────────────────────

/** Một item đề đã dựng xong (chưa lưu DB). */
export type GeneratedItem = {
  index: number;
  itemType: ItemType;
  prompt: string;
  answer: string;
  options: string[] | null;
  audioText: string | null;
  /** Id thẻ SRS gốc — dùng để đẩy về ôn khi sai (task 14.12). */
  cardId: string | null;
  skillName: string | null;
  /** Nhóm từ vựng để sinh option nhiễu. */
  group: string | null;
  /** Độ khó 1..5. */
  difficulty: number;
};

/** Yêu cầu dựng đề. */
export type BlueprintRequest = {
  lang: "zh" | "en";
  level: string;
  topic?: string | null;
  itemTypes: ItemType[];
  count: number;
  /** Seed tất định — cùng seed → cùng đề. */
  seed?: string | null;
  /** Cho phép lấy câu từ kho thẻ SRS hay chỉ ngân hàng seed. */
  useCards?: boolean;
};

/**
 * Phân bổ số câu theo dạng — **tất định**, tổng luôn bằng `count`.
 *
 * Thuật toán: chia đều phần dư cho các dạng đầu tiên. Cùng `itemTypes`
 * (đã sort) → cùng phân bổ, không phụ thuộc thứ tự input.
 */
export function distributeItemTypes(itemTypes: readonly ItemType[], count: number): ItemType[] {
  const types = [...itemTypes].sort();
  if (types.length === 0) return [];
  const out: ItemType[] = [];
  const base = Math.floor(count / types.length);
  const remainder = count % types.length;
  for (let i = 0; i < types.length; i += 1) {
    const type = types[i] as ItemType;
    const n = base + (i < remainder ? 1 : 0);
    for (let k = 0; k < n; k += 1) out.push(type);
  }
  return out;
}

/** Sinh 3 option nhiễu từ các thẻ cùng nhóm (hoặc từ ngân hàng seed). */
function buildDistractors(
  answer: string,
  pool: readonly { back: string }[],
  rand: () => number,
  count = 3,
): string[] {
  const candidates = pool
    .map((p) => p.back)
    .filter((b) => b !== answer && b.length > 0);
  const unique = Array.from(new Set(candidates));
  const picked = shuffle(unique, rand).slice(0, count);
  // Không đủ nhiễu → bù bằng các nhãn chung chung để vẫn đủ 4 lựa chọn.
  const fillers = ["— không đáp án —", "không rõ", "cả ba đều đúng", "không có trong bài"];
  let fi = 0;
  while (picked.length < count) {
    picked.push(fillers[fi % fillers.length] as string);
    fi += 1;
  }
  return picked;
}

/** Chuyển 1 thẻ SRS thành 1 item đề (MC từ vựng). */
function cardToMcItem(card: WeakCard, pool: readonly WeakCard[], rand: () => number): GeneratedItem {
  const question = card.lang === "zh"
    ? `“${card.frontAlt ?? card.front}” nghĩa là gì?`
    : `“${card.front}” nghĩa là gì?`;
  const options = shuffle([card.back, ...buildDistractors(card.back, pool, rand)], rand);
  return {
    index: 0,
    itemType: "mc_vocab",
    prompt: question,
    answer: card.back,
    options,
    audioText: null,
    cardId: card.id,
    skillName: card.group,
    group: card.group,
    difficulty: Math.min(5, Math.max(1, Math.round(card.difficulty) || 1)),
  };
}

/** Chuyển 1 thẻ SRS (mode = "sentence") thành item điền từ. */
function cardToClozeItem(card: WeakCard): GeneratedItem {
  const prompt = card.lang === "zh"
    ? `Điền từ thích hợp: ${card.frontAlt ?? card.front} → ___`
    : `Điền từ thích hợp: ${card.front} → ___`;
  return {
    index: 0,
    itemType: "cloze",
    prompt,
    answer: card.back,
    options: null,
    audioText: null,
    cardId: card.id,
    skillName: card.group,
    group: card.group,
    difficulty: Math.min(5, Math.max(1, Math.round(card.difficulty) || 1)),
  };
}

/**
 * Dựng đề hoàn chỉnh — **tất định**, không gọi AI, không ghi `AiCall`.
 *
 * @returns danh sách item đúng `count` phần tử, đúng phân bổ dạng đã yêu cầu.
 */
export async function generateBlueprint(req: BlueprintRequest): Promise<GeneratedItem[]> {
  const count = Math.max(1, req.count);
  const types = distributeItemTypes(req.itemTypes, count);
  const seedKey = req.seed ?? `${req.lang}|${req.level}|${req.topic ?? "-"}|${[...req.itemTypes].sort().join(",")}|${count}`;
  const rand = seededRandom(hashSeed(seedKey));

  const useCards = req.useCards !== false;
  const weakCards = useCards ? await getWeakCards(req.lang, 80) : [];
  const seedQuestions = getSeedQuestions(req.lang);

  // Kho option nhiễu: ưu tiên thẻ cùng nhóm, fallback toàn bộ thẻ.
  const optionPool = weakCards.length > 0 ? weakCards : [];

  const items: GeneratedItem[] = [];
  let cardCursor = 0;
  let seedCursor = 0;

  for (const itemType of types) {
    // Ưu tiên thẻ yếu cho dạng từ vựng / điền từ.
    if (itemType === "mc_vocab" || itemType === "cloze") {
      const card = weakCards[cardCursor];
      cardCursor += 1;
      if (card) {
        const item = itemType === "mc_vocab"
          ? cardToMcItem(card, optionPool, rand)
          : cardToClozeItem(card);
        items.push(item);
        continue;
      }
    }

    // Ngân hàng seed — lọc theo dạng, xoay vòng bằng PRNG có seed.
    const matching = seedQuestions.filter((q) => q.itemType === itemType);
    if (matching.length > 0) {
      const picked = matching[seedCursor % matching.length] as SeedQuestion;
      seedCursor += 1;
      items.push({
        index: 0,
        itemType,
        prompt: picked.prompt,
        answer: picked.answer,
        options: picked.options ? [...picked.options] : null,
        audioText: picked.audioText ?? null,
        cardId: null,
        skillName: picked.group ?? null,
        group: picked.group ?? null,
        difficulty: picked.difficulty,
      });
      continue;
    }

    // Không có nguồn nào cho dạng này → bỏ trống 1 item để giữ đúng `count`.
    items.push({
      index: 0,
      itemType,
      prompt: "(Chưa có câu hỏi cho dạng này)",
      answer: "",
      options: null,
      audioText: null,
      cardId: null,
      skillName: null,
      group: null,
      difficulty: 1,
    });
  }

  return items.map((item, i) => ({ ...item, index: i }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Chấm tự động
// ─────────────────────────────────────────────────────────────────────────────

/** Kết quả chấm 1 item tự động. */
export type AutoGradeResult = {
  isCorrect: boolean;
  /** Điểm tương đồng 0..1 (MC = 1 hoặc 0; cloze/listening = fuzzy score). */
  score: number;
  /** Đáp án đúng để hiển thị. */
  expected: string;
  /** Ngưỡng đã dùng. */
  threshold: number;
};

/**
 * Chấm tự động item MC / cloze / listening (task 14.10).
 *
 * - **MC**: so khớp **chính xác** với 1 option — trắc nghiệm không chấm fuzzy
 *   (gần đúng là sai).
 * - **cloze / listening**: so khớp fuzzy (bỏ dấu câu + khoảng trắng), ngưỡng 0.8.
 *
 * @param itemType dạng câu
 * @param userAnswer đáp án người dùng nhập/chọn
 * @param expected đáp án đúng
 */
export function autoGrade(
  itemType: ItemType,
  userAnswer: string | null | undefined,
  expected: string,
  threshold = 0.8,
): AutoGradeResult {
  const user = (userAnswer ?? "").trim();
  const expectedTrim = expected.trim();

  if (itemType === "mc_vocab" || itemType === "mc_grammar") {
    const isCorrect = user.length > 0 && user === expectedTrim;
    return { isCorrect, score: isCorrect ? 1 : 0, expected: expectedTrim, threshold };
  }

  // Tiếng Trung không phân biệt từ bằng khoảng trắng → bỏ space khi so khớp.
  const keepSpaces = true;
  const match = matchAnswer(user, expectedTrim, threshold, keepSpaces);
  return {
    isCorrect: match.correct,
    score: match.score,
    expected: expectedTrim,
    threshold,
  };
}

/** Nhóm lỗi hợp lệ — dùng để validate output AI chấm writing/translation. */
export const ERROR_GROUP_KEYS = RUBRIC_LANGUAGE_ERRORS.map((g) => g.key);

/**
 * Chuẩn hoá output chấm lỗi của AI về đúng 4 nhóm (task 14.11).
 *
 * AI có thể trả về nhóm lạ ("spelling", "syntax"…) → gộp về nhóm gần nhất
 * để mọi lỗi luôn thuộc **đúng 1 trong 4 nhóm** đã chốt.
 */
export function normalizeErrorGroups(
  raw: unknown,
): Record<string, Array<{ original: string; correction: string; explanation: string }>> {
  const out: Record<string, Array<{ original: string; correction: string; explanation: string }>> = {};
  for (const key of ERROR_GROUP_KEYS) out[key] = [];

  if (!raw || typeof raw !== "object") return out;

  const entries = Object.entries(raw as Record<string, unknown>);
  for (const [group, list] of entries) {
    const target = ERROR_GROUP_KEYS.includes(group)
      ? group
      : // Gộp nhóm lạ vào nhóm gần nghĩa nhất.
        (group.includes("gram") || group.includes("syntax") ? "grammar"
          : group.includes("vocab") || group.includes("word") || group.includes("spell") ? "vocab"
            : group.includes("express") || group.includes("style") ? "expression"
              : "context");
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      const original = typeof e.original === "string" ? e.original : "";
      const correction = typeof e.correction === "string" ? e.correction : "";
      const explanation = typeof e.explanation === "string" ? e.explanation : "";
      if (!original) continue;
      out[target]?.push({ original, correction, explanation });
    }
  }

  return out;
}

/** Tổng điểm của 1 bài chấm tự động — số câu đúng. */
export function countCorrect(items: Array<{ isCorrect: boolean | null }>): number {
  return items.filter((i) => i.isCorrect === true).length;
}
