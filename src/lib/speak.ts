import { prisma } from "@/lib/db";
import { toDateKey } from "@/lib/dates";
import { recordEvidence } from "@/lib/skills";

/**
 * Lớp nghiệp vụ Luyện nói / Luyện viết (S10 + S11) — FR-CM-01..12.
 *
 * ⚠️ AC-CM-1 — rubric có **đúng 5 tiêu chí**, không phải 4.
 * ⚠️ AC-CM-2 — tổng điểm = **trung bình** các tiêu chí.
 * ⚠️ AC-CM-3 — delta so với lần trước **của chính người dùng**.
 * ⚠️ AC-CM-5 — mọi bài luyện đều tạo `Evidence`.
 * ⚠️ AC-CM-11 — không có API key ⇒ **không** giả lập kết quả AI.
 */

/* ══ Rubric ══════════════════════════════════════════════════════════════ */

/** 5 tiêu chí chấm điểm (AC-CM-1). */
export const RUBRIC_CRITERIA = [
  "accuracy",
  "fluency",
  "vocabulary",
  "grammar",
  "coherence",
] as const;

export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];

export interface RubricScores {
  accuracy: number;
  fluency: number;
  vocabulary: number;
  grammar: number;
  coherence: number;
}

export interface GradeResult {
  /** Tổng điểm = trung bình 5 tiêu chí (AC-CM-2). */
  score: number;
  /** Điểm từng tiêu chí. */
  rubric: RubricScores;
  /** Nhận xét ngắn (tiếng Việt). */
  feedback: string;
  /** 4 nhóm lỗi (grammar, vocab, expression, context). */
  errorGroups: {
    grammar: string[];
    vocab: string[];
    expression: string[];
    context: string[];
  };
  /** Gợi ý sửa, tối đa 5 câu. */
  corrections: string[];
  /** Nguồn chấm: `ai` | `local` — KHÔNG giả lập. */
  source: "ai" | "local";
}

/**
 * Tính tổng điểm = trung bình 5 tiêu chí (AC-CM-2).
 *
 * ⚠️ Làm tròn 1 chữ số thập phân.
 */
export function averageRubric(rubric: RubricScores): number {
  const values = RUBRIC_CRITERIA.map((key) => rubric[key]);
  const sum = values.reduce((acc, value) => acc + value, 0);

  return Number((sum / values.length).toFixed(1));
}

/**
 * Chuẩn hoá rubric từ AI: ép đủ 5 tiêu chí, ép điểm trong 0..5.
 */
export function normalizeRubric(raw: unknown): RubricScores {
  const source = (raw ?? {}) as Partial<Record<RubricCriterion, unknown>>;

  const pick = (key: RubricCriterion, fallback: number): number => {
    const value = Number(source[key]);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(5, Math.max(0, value));
  };

  return {
    accuracy: pick("accuracy", 0),
    fluency: pick("fluency", 0),
    vocabulary: pick("vocabulary", 0),
    grammar: pick("grammar", 0),
    coherence: pick("coherence", 0),
  };
}

/**
 * Chuẩn hoá 4 nhóm lỗi.
 */
export function normalizeErrorGroups(raw: unknown): GradeResult["errorGroups"] {
  const source = (raw ?? {}) as Record<string, unknown>;

  const toList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === "string" ? item : String(item)))
      .filter((item) => item.trim().length > 0)
      .slice(0, 10);
  };

  return {
    grammar: toList(source.grammar),
    vocab: toList(source.vocab),
    expression: toList(source.expression),
    context: toList(source.context),
  };
}

/**
 * Chấm điểm cục bộ khi không có AI (AC-CM-11).
 *
 * ⚠️ Đây là **ước dự phòng có giới hạn**, KHÔNG phải kết quả AI:
 * - dùng `source: "local"` để UI không ghi "AI";
 * - điểm là ước lượng rất thô dựa trên độ dài + độ đa dạng từ.
 */
export function gradeLocally(text: string): GradeResult {
  const trimmed = text.trim();
  const words = trimmed.length > 0 ? trimmed.split(/\s+/) : [];

  // Độ dài: 20 từ ⇒ đủ 5 điểm fluency.
  const fluency = Math.min(5, Number((words.length / 4).toFixed(1)));
  // Độ đa dạng từ: tỉ lệ từ khác nhau.
  const uniqueRatio = words.length === 0 ? 0 : new Set(words).size / words.length;
  const vocabulary = Number((uniqueRatio * 5).toFixed(1));
  // Câu có dấu kết thúc ⇒ coherence tốt hơn.
  const sentences = trimmed.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0);
  const coherence = Math.min(5, Number((sentences.length * 2.5).toFixed(1)));

  const rubric: RubricScores = {
    // ⚠️ Không có AI ⇒ không thể chấm độ chính xác ⇒ đặt trung tính 2.5.
    accuracy: 2.5,
    fluency,
    vocabulary,
    grammar: 2.5,
    coherence,
  };

  return {
    score: averageRubric(rubric),
    rubric,
    feedback:
      words.length === 0
        ? "Bài viết còn trống — viết thêm để được chấm."
        : "Chấm sơ bộ bằng rule cục bộ (chưa có phản hồi AI). Thêm API key để được chấm theo rubric đầy đủ.",
    errorGroups: { grammar: [], vocab: [], expression: [], context: [] },
    corrections: [],
    source: "local",
  };
}

/* ══ Kho bài mẫu (AC-CM-6) ═════════════════════════════════════════════════ */

/**
 * Đọc kho bài luyện nói từ seed.
 *
 * ⚠️ Dùng `Activity` với `type = "speak"` / `type = "roleplay"` — không
 * hardcode trong code.
 */
export async function listSpeakPrompts(options?: {
  lang?: string;
  mode?: string;
}): Promise<
  Array<{
    id: string;
    title: string;
    prompt: string;
    lang: string | null;
    level: string | null;
    mode: string | null;
    minutes: number;
    isUserMade: boolean;
  }>
> {
  const rows = await prisma.activity.findMany({
    where: {
      type: "speak",
      ...(options?.lang ? { language: options.lang } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      content: true,
      language: true,
      minutes: true,
    },
  });

  return rows.map((row) => {
    // Metadata được nhúng trong `content` dạng JSON (seed ghi kèm).
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.content ?? "{}") as Record<string, unknown>;
    } catch {
      meta = {};
    }

    return {
      id: row.id,
      title: row.title,
      prompt: (meta.prompt as string) ?? row.content ?? "",
      lang: (meta.lang as string) ?? row.language ?? null,
      level: (meta.level as string) ?? null,
      mode: (meta.mode as string) ?? null,
      minutes: row.minutes,
      isUserMade: row.id.startsWith("seed-") ? false : true,
    };
  });
}

/**
 * Đọc kho tình huống hội thoại.
 */
export async function listRoleplayScenarios(): Promise<
  Array<{
    id: string;
    title: string;
    brief: string;
    hiddenGoal: string;
    lang: string | null;
    level: string | null;
    durationSec: number;
  }>
> {
  const rows = await prisma.activity.findMany({
    where: { type: "roleplay" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, content: true, minutes: true },
  });

  return rows.map((row) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.content ?? "{}") as Record<string, unknown>;
    } catch {
      meta = {};
    }

    return {
      id: row.id,
      title: row.title,
      brief: (meta.brief as string) ?? row.content ?? "",
      hiddenGoal: (meta.hiddenGoal as string) ?? "",
      lang: (meta.lang as string) ?? null,
      level: (meta.level as string) ?? null,
      durationSec: (meta.durationSec as number) ?? row.minutes * 60,
    };
  });
}

/* ══ Lưu lượt luyện ══════════════════════════════════════════════════════ */

export interface SpeakAttemptInput {
  /** Mã bài (id của `Activity` seed) — null cho bài tự do. */
  promptId?: string | null;
  /** Nội dung người dùng viết/nói. */
  text: string;
  /** Ngôn ngữ. */
  lang?: string;
  /** `speak` | `write`. */
  mode?: string;
  /** Kỹ năng được gán. */
  skillId?: string | null;
  /** Điểm chấm (nếu đã chấm). */
  grade?: GradeResult | null;
}

export interface SpeakAttemptDTO {
  id: string;
  title: string;
  text: string;
  mode: string;
  lang: string | null;
  score: number | null;
  rubric: RubricScores | null;
  createdAt: string;
}

/**
 * Lưu 1 lượt luyện (AC-CM-5).
 *
 * ⚠️ AC-CM-5 — mọi bài luyện đều tạo `Evidence` (khi có skillId) ⇒ level
 * được tính lại đúng (P3).
 */
export async function saveAttempt(
  input: SpeakAttemptInput,
): Promise<SpeakAttemptDTO> {
  const trimmed = input.text.trim();

  if (trimmed.length === 0) {
    throw new Error("empty_attempt");
  }

  const mode = input.mode ?? "write";

  const activity = await prisma.activity.create({
    data: {
      domain: "language",
      type: mode === "speak" ? "speak" : "write",
      minutes: 0,
      title:
        input.promptId === null || input.promptId === undefined
          ? "Lượt luyện tự do"
          : `Luyện ${mode}`,
      content: trimmed,
      skillId: input.skillId ?? null,
      language: input.lang ?? null,
      quality: input.grade ? Math.round(input.grade.score) : null,
      aiScore: input.grade ? input.grade.score : null,
    },
    select: { id: true, title: true, content: true, language: true, aiScore: true, createdAt: true },
  });

  // ⚠️ AC-CM-5 — tạo Evidence ⇒ tiến độ là bằng chứng (P3).
  if (input.skillId) {
    await recordEvidence({
      skillId: input.skillId,
      activityId: activity.id,
      // Rating 3 = đạt chuẩn ⇒ tính vào level.
      rating: 3,
    });
  }

  const rubric = input.grade?.rubric ?? null;

  return {
    id: activity.id,
    title: activity.title,
    text: activity.content ?? "",
    mode,
    lang: activity.language,
    score: activity.aiScore,
    rubric,
    createdAt: activity.createdAt.toISOString(),
  };
}

/**
 * Lịch sử lượt luyện — để tính delta (AC-CM-3).
 */
export async function listAttempts(options?: {
  mode?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    title: string;
    text: string;
    mode: string;
    lang: string | null;
    score: number | null;
    createdAt: string;
  }>
> {
  const rows = await prisma.activity.findMany({
    where: {
      type: { in: ["speak", "write"] },
      ...(options?.mode ? { type: options.mode } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, options?.limit ?? 20)),
    select: {
      id: true,
      title: true,
      content: true,
      language: true,
      aiScore: true,
      createdAt: true,
      type: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    text: row.content ?? "",
    mode: row.type,
    lang: row.language,
    score: row.aiScore,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Delta so với lần trước **cùng chế độ** (AC-CM-3).
 *
 * @returns `null` khi chưa có lần trước ⇒ không bịa số 0.
 */
export async function getDelta(
  mode: string,
  currentScore: number,
): Promise<{ previous: number; delta: number } | null> {
  const rows = await prisma.activity.findMany({
    where: { type: mode, aiScore: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { aiScore: true },
  });

  if (rows.length < 2) return null;

  const previous = rows[1].aiScore ?? 0;
  return {
    previous: Number(previous.toFixed(1)),
    delta: Number((currentScore - previous).toFixed(1)),
  };
}

/**
 * Sinh flashcard từ từ khoá bài viết (AC-CM-10).
 *
 * ⚠️ Tạo `Card` với `mode = "produce"`, `due = now + 12h` (registry M9).
 */
export async function createPracticeCards(input: {
  cards: Array<{ front: string; back: string; lang: string }>;
}): Promise<number> {
  const due = new Date(Date.now() + 12 * 3600_000);

  let created = 0;

  for (const card of input.cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    if (front.length === 0 || back.length === 0) continue;

    await prisma.card.create({
      data: {
        lang: card.lang === "en" ? "en" : "zh",
        front,
        back,
        mode: "produce",
        cardState: {
          version: 1,
          due: due.toISOString(),
          stability: 0,
          difficulty: 0,
          scheduledDays: 0,
          learningSteps: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          lastReview: null,
        },
        due,
      },
    });

    created += 1;
  }

  return created;
}

/**
 * Ngày hiện tại dạng `yyyy-MM-dd` (helper cho log).
 */
export function todayKey(): string {
  return toDateKey(new Date());
}
