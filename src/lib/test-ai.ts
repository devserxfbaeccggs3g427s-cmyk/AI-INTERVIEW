/**
 * Prompt & schema cho bài kiểm tra ngoại ngữ (AI-14, AI-15, AI-16).
 *
 * ⚠️ QUY TẮC CỨNG (FR-AI-09): mọi prompt ở đây là **hằng số** — KHÔNG chứa
 * ngày tháng, tên người dùng, UUID hay `Date.now()`. Toàn bộ dữ liệu biến động
 * nằm trong `messages` (sau breakpoint cache).
 *
 * ⚠️ P4: `RUBRIC_LANGUAGE_ERRORS` (4 nhóm) được **dùng chung** từ `prompts.ts` —
 * không khai báo lại ở đây.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  AiSchemaError,
  callAIJson,
  isAiAvailable,
  streamAI,
  toAiError,
} from "@/lib/anthropic";
import { STABLE_SYSTEM } from "@/lib/prompts";
import {
  averageRubric,
  clampLevel,
  ERROR_GROUP_KEYS,
  type ErrorGroups,
  type ItemType,
  type LevelCode,
  type RubricScores,
  type SessionSummary,
} from "@/lib/test";

export { STABLE_SYSTEM };

/* ══ AI-14 — sinh blueprint bài kiểm tra ════════════════════════════════ */

/**
 * System prompt cố định cho AI-14.
 *
 * ⚠️ Cấm sinh từ vựng mới (FR-LT-10, R6): AI chỉ sinh *cách hỏi*, mọi từ đích
 * phải đến từ thẻ của người dùng hoặc ngân hàng seed.
 */
export const TEST_BLUEPRINT_SYSTEM = `
Bạn soạn đề kiểm tra ngoại ngữ cho Daily Loop OS.

NGUYÊN TẮC BẤT DI BẤT DỊCH:
1. TUYỆT ĐỐI KHÔNG sinh từ vựng mới. Mọi từ đích trong câu hỏi phải đến từ
   danh sách thẻ được cung cấp. Thiếu thẻ thì bỏ trống, tuyệt đối không bịa.
2. Bạn chỉ sinh CÁCH HỎI (câu hỏi, lựa chọn nhiễu, chỗ trống, đoạn nghe).
   Đáp án đúng luôn là một trong các lựa chọn bạn đưa ra.
4. Trả lời bằng tiếng Việt cho phần hướng dẫn; nội dung học dùng đúng ngôn ngữ
   đích (zh-Hans hoặc en-US).
5. Không thêm trường ngoài schema, không bỏ trường bắt buộc.
`.trim();

/** Mô tả format từng câu — nằm cùng system để AI biết đúng cấu trúc. */
export const TEST_BLUEPRINT_SPEC = `
CẤU TRÚC 1 CÂU HỎI:
- itemType: mc_vocab | mc_grammar | cloze | listening | writing | translation
- prompt: nội dung câu hỏi. Với cloze, chỗ trống viết bằng "___".
- audioText: chỉ dùng cho listening (và mc_vocab nghe) — đoạn ngắn để đọc bằng TTS.
- options: mảng đúng 4 lựa chọn cho mc_vocab | mc_grammar | listening; null cho
  cloze | writing | translation.
- answer: đáp án đúng. Với mc_* | listening là đúng 1 phần tử của options.
  Với cloze là từ cần điền. Với writing | translation là bài mẫu tham chiếu.
- cardId: id thẻ được cung cấp mà câu này kiểm tra; null nếu câu không gắn thẻ
  (ví dụ mc_grammar tổng quát).
- skillName: tên kỹ năng liên quan (có thể null).

LUYỆN TẬP NHIỄU:
- mc_vocab | mc_grammar | listening: 3 đáp án nhiễu phải cùng nhóm/level và
  cùng độ dài với đáp án đúng, đủ hấp dẫn để người học bị sai.
- Không dùng "tất cả các đáp án trên" hay "không có đáp án nào đúng".
`.trim();

/** Schema kết quả AI-14. */
export const TestBlueprintSchema = z.object({
  items: z.array(
    z.object({
      itemType: z.enum([
        "mc_vocab",
        "mc_grammar",
        "cloze",
        "listening",
        "writing",
        "translation",
      ]),
      prompt: z.string().min(1),
      audioText: z.string().nullable(),
      options: z.array(z.string()).nullable(),
      answer: z.string().nullable(),
      cardId: z.string().nullable(),
      skillName: z.string().nullable(),
    }),
  ),
});

export type TestBlueprintPayload = z.infer<typeof TestBlueprintSchema>;

/* ══ AI-15 — chấm câu tự luận (4 nhóm lỗi) ══════════════════════════════ */

/**
 * System prompt cố định cho AI-15 — chấm **đúng** 4 nhóm lỗi.
 */
export const TEST_GRADE_SYSTEM = `
Bạn chấm bài ngoại ngữ tự luận cho Daily Loop OS.

NGUYÊN TẮC BẤT DI BẤT DỊCH:
1. Chỉ được dùng ĐÚNG 4 nhóm lỗi: grammar (ngữ pháp) · vocab (từ vựng) ·
   expression (cách diễn đạt) · context (ngữ cảnh). Không thêm nhóm, không đổi
   tên nhóm, không gộp nhóm.
2. Mỗi nhóm chấm 0–10 (10 = hoàn hảo, 0 = sai hoàn toàn). Điểm phải bám sát
   bài làm, không chấm theo cảm tính.
3. Mỗi lỗi ghi trong trường errors phải là câu trích nguyên văn từ bài làm
   (ngắn gọn) kèm mô tả lỗi bằng tiếng Việt.
4. Nếu một nhóm không có lỗi, trả mảng rỗng cho nhóm đó và cho điểm từ 8 trở lên.
5. Không bịa lỗi: bài làm đúng thì điểm cao, danh sách lỗi rỗng.
6. Trường feedback là nhận xét ngắn, trực diện, trong 1 đến 3 câu.
`.trim();

/**
 * Schema chấm điểm — `.strict()` để **reject** nhóm lạ (AC-12).
 */
export const TestGradeSchema = z
  .object({
    rubric: z.object({
      grammar: z.number().min(0).max(10),
      vocab: z.number().min(0).max(10),
      expression: z.number().min(0).max(10),
      context: z.number().min(0).max(10),
    }),
    errors: z.object({
      grammar: z.array(z.string()),
      vocab: z.array(z.string()),
      expression: z.array(z.string()),
      context: z.array(z.string()),
    }),
    feedback: z.string(),
    correctedAnswer: z.string().nullable(),
  })
  .strict();

export type TestGradePayload = z.infer<typeof TestGradeSchema>;

/* ══ AI-16 — ước lượng level ════════════════════════════════════════════ */

/** System prompt cố định cho AI-16 — chỉ chọn level trong enum. */
export const TEST_LEVEL_SYSTEM = `
Bạn ước lượng trình độ người dùng sau một bài kiểm tra ngoại ngữ.

NGUYÊN TẮC BẤT DI BẤT DỊCH:
1. Chỉ được chọn level trong enum: zero · A1 · A2 · B1 · B2 · C1 · C2.
   TUYỆT ĐỐI không tự tạo mức mới (ví dụ "B2+", "trung cấp").
2. Mốc band code do hệ thống tính là nguồn số chính. Nếu bạn chọn lệch quá 1 bậc,
   hệ thống sẽ kéo về mốc band code — hãy chọn sát mốc đó.
3. Trường confidence là 0 đến 1: mức tin cậy vào ước lượng dựa trên số liệu được cung cấp.
4. Trường bottleneck là dạng câu có tỷ lệ đúng thấp nhất (trong danh sách được cho),
   hoặc null nếu không rõ.
5. Trường reason giải thích ngắn bằng tiếng Việt, dựa trên số liệu thật.
6. Trường hsk là số 0 đến 6 tương ứng (chỉ có ý nghĩa với tiếng Trung).
`.trim();

/** Schema ước lượng level. */
export const TestLevelSchema = z.object({
  level: z.enum(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]),
  cefr: z.string(),
  hsk: z.number().int().min(0).max(6),
  confidence: z.number().min(0).max(1),
  bottleneck: z
    .enum(["mc_vocab", "mc_grammar", "cloze", "listening", "writing", "translation"])
    .nullable(),
  reason: z.string(),
});

export type TestLevelPayload = z.infer<typeof TestLevelSchema>;

/* ══ System blocks ═══════════════════════════════════════════════════════ */

/**
 * Mảng `system` cho AI-14 — `[STABLE_SYSTEM, BLUEPRINT_SYSTEM, SPEC(cache)]`.
 * Breakpoint nằm ở block cuối ⇒ cache được toàn bộ prefix.
 */
export function buildBlueprintSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: STABLE_SYSTEM },
    { type: "text", text: TEST_BLUEPRINT_SYSTEM },
    { type: "text", text: TEST_BLUEPRINT_SPEC, cache_control: { type: "ephemeral" } },
  ];
}

/** Mảng `system` cho AI-15 — `[STABLE_SYSTEM, GRADE_SYSTEM(cache)]`. */
export function buildGradeSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: STABLE_SYSTEM },
    { type: "text", text: TEST_GRADE_SYSTEM, cache_control: { type: "ephemeral" } },
  ];
}

/** Mảng `system` cho AI-16 — `[STABLE_SYSTEM, LEVEL_SYSTEM(cache)]`. */
export function buildLevelSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: STABLE_SYSTEM },
    { type: "text", text: TEST_LEVEL_SYSTEM, cache_control: { type: "ephemeral" } },
  ];
}

/* ══ User message builders (dữ liệu biến động) ══════════════════════════ */

export interface BlueprintCardInput {
  cardId: string;
  front: string;
  frontAlt: string | null;
  back: string;
  band: 1 | 2 | 3;
}

/**
 * User message AI-14 — toàn bộ dữ liệu biến động nằm ở `messages`
 * (sau breakpoint cache).
 */
export function buildBlueprintUserMessage(input: {
  lang: string;
  level: string;
  topic: string | null;
  itemTypes: readonly ItemType[];
  count: number;
  cards: readonly BlueprintCardInput[];
  sourceText?: string | null;
}): string {
  const counts = new Map<ItemType, number>();
  for (const type of input.itemTypes) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const lines: string[] = [
    `Ngôn ngữ đích: ${input.lang}`,
    `Level mục tiêu: ${input.level}`,
    input.topic ? `Chủ đề: ${input.topic}` : "",
    "",
    "PHÂN BỔ DẠNG CÂU YÊU CẦU (tổng " + input.count + " câu):",
    ...[...counts.entries()].map(
      ([type, count]) => `  - ${type}: ${count} câu`,
    ),
    "",
    input.sourceText
      ? `VĂN BẢN NGƯỜI DÙNG DÁN (dùng để sinh câu đọc hiểu):\n${input.sourceText}\n`
      : "",
    "THẺ TỪ VỰNG ĐƯỢC CUNG CẤP (chỉ được dùng các từ này):",
    input.cards.length === 0
      ? "  (không có thẻ nào — chỉ sinh câu mc_grammar tổng quát, cardId = null)"
      : input.cards
          .map(
            (card) =>
              `  - ${card.cardId} · ${card.front}${card.frontAlt ? ` (${card.frontAlt})` : ""} · nghĩa: ${card.back} · band ${card.band}`,
          )
          .join("\n"),
    "",
    "Hãy sinh đúng số câu theo phân bổ trên, mỗi câu đúng 1 dạng.",
  ];

  return lines.filter((line) => line !== "").join("\n");
}

/** User message AI-15 — đề bài + bài mẫu + bài làm của người dùng. */
export function buildGradeUserMessage(input: {
  lang: string;
  itemType: ItemType;
  prompt: string;
  reference: string | null;
  userAnswer: string;
}): string {
  return [
    `Ngôn ngữ đích: ${input.lang}`,
    `Dạng câu: ${input.itemType}`,
    "",
    "ĐỀ BÀI:",
    input.prompt,
    "",
    "BÀI MẪU THAM CHIẾU:",
    input.reference ?? "(không có bài mẫu — chấm theo đề bài)",
    "",
    "BÀI LÀM CỦA NGƯỜI DÙNG:",
    input.userAnswer,
    "",
    "Chấm theo đúng 4 nhóm lỗi (grammar · vocab · expression · context), mỗi nhóm 0–10.",
  ].join("\n");
}

/** User message AI-16 — `byItemType` + tổng điểm + mốc band code. */
export function buildLevelUserMessage(input: {
  lang: string;
  byItemType: ReadonlyArray<{ itemType: string; correct: number; total: number; rate: number }>;
  score: number;
  maxScore: number;
  bandCode: string;
}): string {
  return [
    `Ngôn ngữ: ${input.lang}`,
    `Tổng điểm: ${input.score}/${input.maxScore}`,
    `Mốc band code do hệ thống tính: ${input.bandCode}`,
    "",
    "KẾT QUẢ THEO DẠNG CÂU:",
    input.byItemType
      .map(
        (stat) =>
          `  - ${stat.itemType}: ${stat.correct}/${stat.total} đúng (${(stat.rate * 100).toFixed(0)}%)`,
      )
      .join("\n"),
    "",
    `Chọn level trong enum zero·A1·A2·B1·B2·C1·C2, sát mốc band code.`,
  ].join("\n");
}


/* ══ Orchestration (AI-14 / AI-15 / AI-16) ══════════════════════════════ */


export interface GeneratedItem {
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  options: string[] | null;
  answer: string | null;
  cardId: string | null;
  skillName: string | null;
}

export interface GenerateTestResult {
  items: GeneratedItem[];
  warnings: string[];
}

export interface ReconcileResult {
  items: GeneratedItem[];
  warnings: string[];
}

/**
 * Cắt item dư, bù item thiếu — **KHÔNG nhân bản** (D7).
 *
 * - Thừa → cắt theo đúng phân bổ dạng.
 * - Thiếu → bù bằng item "no-card" (`mc_grammar` tổng quát) sinh bằng rule
 *   cục bộ ⇒ không bao giờ để AI bịa từ mới (FR-LT-10).
 */
export function reconcileGeneratedItems(
  generated: readonly GeneratedItem[],
  itemTypes: readonly ItemType[],
  cardIds: readonly string[],
): ReconcileResult {
  const warnings: string[] = [];
  const wanted = new Map<ItemType, number>();
  for (const type of itemTypes) {
    wanted.set(type, (wanted.get(type) ?? 0) + 1);
  }

  const validCardIds = new Set(cardIds);
  const kept: GeneratedItem[] = [];
  const usedCounts = new Map<ItemType, number>();

  for (const item of generated) {
    const limit = wanted.get(item.itemType) ?? 0;
    const current = usedCounts.get(item.itemType) ?? 0;
    if (current >= limit) continue;

    // `cardId` phải có thật trong danh sách thẻ được cấp (FR-LT-10).
    const cardId = item.cardId && validCardIds.has(item.cardId) ? item.cardId : null;

    kept.push({ ...item, cardId });
    usedCounts.set(item.itemType, current + 1);
  }

  // Bù phần thiếu bằng item `mc_grammar` tổng quát (không gắn thẻ).
  const missingTypes: ItemType[] = [];
  for (const [type, count] of wanted.entries()) {
    const have = usedCounts.get(type) ?? 0;
    for (let i = have; i < count; i += 1) missingTypes.push(type);
  }

  if (missingTypes.length > 0) {
    warnings.push(
      `AI sinh thiếu ${missingTypes.length}/${itemTypes.length} câu — phần còn thiếu đã được cân bằng lại bằng câu ngữ pháp tổng quát.`,
    );
  }

  const filler = missingTypes.map((type, index) => buildFallbackItem(type, index));
  const all = [...kept, ...filler];

  // Sắp xếp lại theo phân bổ dạng yêu cầu để đề cân đối.
  const remaining = new Map(wanted);
  const ordered: GeneratedItem[] = [];
  for (const item of all) {
    const left = remaining.get(item.itemType) ?? 0;
    if (left <= 0) continue;
    remaining.set(item.itemType, left - 1);
    ordered.push(item);
  }

  return { items: ordered, warnings };
}

/**
 * Item dự phòng sinh bằng **rule cục bộ** — không gọi AI, không bịa từ mới.
 */
export function buildFallbackItem(itemType: ItemType, index: number): GeneratedItem {
  if (itemType === "cloze") {
    return {
      itemType,
      prompt: "Điền từ vào chỗ trống: ___ là buổi học đầu tiên trong tuần.",
      audioText: null,
      options: null,
      answer: "bài",
      cardId: null,
      skillName: null,
    };
  }

  if (itemType === "listening") {
    return {
      itemType,
      prompt: "Nghe đoạn ngắn và chọn nghĩa đúng.",
      audioText: "This is a general practice sentence for listening practice.",
      options: [
        "Một câu luyện tập nghe chung.",
        "Một câu luyện tập viết chung.",
        "Một câu luyện tập đọc chung.",
        "Một câu luyện tập nói chung.",
      ],
      answer: "Một câu luyện tập nghe chung.",
      cardId: null,
      skillName: null,
    };
  }

  if (itemType === "writing") {
    return {
      itemType,
      prompt: "Viết 2 câu giới thiệu bản thân bằng tiếng Anh.",
      audioText: null,
      options: null,
      answer: "My name is Dev. I am learning English every day.",
      cardId: null,
      skillName: null,
    };
  }

  if (itemType === "translation") {
    return {
      itemType,
      prompt: "Dịch sang tiếng Anh: Tôi học tiếng Anh mỗi ngày.",
      audioText: null,
      options: null,
      answer: "I study English every day.",
      cardId: null,
      skillName: null,
    };
  }

  if (itemType === "mc_vocab") {
    return {
      itemType,
      prompt: "Chọn từ phù hợp với nghĩa: học / học tập.",
      audioText: null,
      options: ["learn", "sleep", "read", "write"],
      answer: "learn",
      cardId: null,
      skillName: null,
    };
  }

  return {
    itemType: "mc_grammar",
    prompt: `Chọn cấu trúc đúng cho câu ${index + 1}: I ___ to work every day.`,
    audioText: null,
    options: ["have", "has", "am", "are"],
    answer: "have",
    cardId: null,
    skillName: null,
  };
}

/**
 * AI-14 — sinh câu hỏi theo blueprint.
 *
 * ⚠️ Thiếu API key ⇒ ném `AiOfflineError` (KHÔNG giả lập kết quả AI).
 */
export async function generateTestItems(bp: {
  lang: string;
  level: string;
  topic: string | null;
  itemTypes: readonly ItemType[];
  count: number;
  cards: ReadonlyArray<{
    cardId: string;
    front: string;
    frontAlt: string | null;
    back: string;
    band: 1 | 2 | 3;
  }>;
  sourceText?: string | null;
}): Promise<GenerateTestResult> {
  if (!isAiAvailable()) {
    // `streamAI` ném `AiOfflineError` — gọi 1 vòng để nhận đúng loại lỗi
    // typed mà không giả lập kết quả AI.
    const iterator = streamAI("AI-14", {
      system: buildBlueprintSystemBlocks(),
      messages: [{ role: "user", content: "ping" }],
    });
    await iterator.next();
    return { items: [], warnings: [] };
  }

  const schema = TestBlueprintSchema;
  const userContent = buildBlueprintUserMessage(bp);

  let partial = "";
  let payload: TestBlueprintPayload | null = null;

  for await (const event of streamAI("AI-14", {
    system: buildBlueprintSystemBlocks(),
    messages: [{ role: "user", content: userContent }],
    schema,
    maxTokens: 16_000,
  })) {
    if (event.type !== "json") continue;
    partial = event.partial;
    try {
      payload = schema.parse(JSON.parse(partial)) as TestBlueprintPayload;
    } catch {
      // JSON chưa hoàn chỉnh — chờ delta tiếp theo.
    }
  }

  if (!payload) {
    // Stream kết thúc mà JSON chưa đủ ⇒ parse lần cuối để báo lỗi schema.
    const parsed = schema.safeParse(JSON.parse(partial));
    if (!parsed.success) {
      throw new AiSchemaError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    payload = parsed.data;
  }

  const items: GeneratedItem[] = payload.items.map((item) => ({
    itemType: item.itemType,
    prompt: item.prompt,
    audioText: item.audioText,
    options: item.options,
    answer: item.answer,
    cardId: item.cardId,
    skillName: item.skillName,
  }));

  return reconcileGeneratedItems(items, bp.itemTypes, bp.cards.map((c) => c.cardId));
}

/**
 * AI-15 — chấm câu tự luận theo 4 nhóm lỗi.
 *
 * ⚠️ Điểm tổng do **code** tính (trung bình 4 nhóm) — không tin tổng của AI.
 */
export async function gradeOpenItem(input: {
  lang: string;
  itemType: ItemType;
  prompt: string;
  reference: string | null;
  userAnswer: string;
}): Promise<{
  rubric: RubricScores;
  errors: ErrorGroups;
  score: number;
  feedback: string;
  correctedAnswer: string | null;
}> {
  const result = await callAIJson("AI-15", TestGradeSchema, {
    system: buildGradeSystemBlocks(),
    messages: [
      {
        role: "user",
        content: buildGradeUserMessage(input),
      },
    ],
    maxTokens: 4_000,
  });

  const rubric = result.data.rubric;
  const errors: ErrorGroups = {
    grammar: result.data.errors.grammar,
    vocab: result.data.errors.vocab,
    expression: result.data.errors.expression,
    context: result.data.errors.context,
  };

  return {
    rubric,
    errors,
    score: Math.round(averageRubric(rubric) * 100) / 100,
    feedback: result.data.feedback,
    correctedAnswer: result.data.correctedAnswer,
  };
}

/**
 * AI-16 — ước lượng level (không streaming, effort low).
 *
 * ⚠️ Level AI lệch > 1 bậc so với band code ⇒ bị kéo về band code (LT-R6).
 */
export async function estimateLevelWithAi(input: {
  lang: string;
  summary: SessionSummary;
  localLevel: LevelCode;
}): Promise<{
  level: LevelCode;
  cefr: string;
  hsk: number;
  confidence: number;
  bottleneck: ItemType | null;
  reason: string;
}> {
  const result = await callAIJson("AI-16", TestLevelSchema, {
    system: buildLevelSystemBlocks(),
    messages: [
      {
        role: "user",
        content: buildLevelUserMessage({
          lang: input.lang,
          byItemType: input.summary.byItemType.map((s) => ({
            itemType: s.itemType,
            correct: s.correct,
            total: s.total,
            rate: s.rate,
          })),
          score: input.summary.score,
          maxScore: input.summary.maxScore,
          bandCode: input.localLevel,
        }),
      },
    ],
    maxTokens: 2_000,
  });

  return {
    level: clampLevel(result.data.level, input.localLevel),
    cefr: result.data.cefr,
    hsk: result.data.hsk,
    confidence: result.data.confidence,
    bottleneck: result.data.bottleneck,
    reason: result.data.reason,
  };
}

/** Re-export để route dùng chung error mapping. */
export { toAiError, ERROR_GROUP_KEYS };
