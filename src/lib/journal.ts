import { prisma } from "@/lib/db";
import { addDays, normalizeDate, toDateKey } from "@/lib/dates";
import { EVIDENCE_RATING_MIN } from "@/lib/config";
import { recordEvidence } from "@/lib/skills";

/**
 * Lớp nghiệp vụ Nhật ký & phản hồi AI (S06) + Đánh giá chính (S12).
 *
 * ⚠️ FR-PS-07 — dữ liệu cá nhân **không rời máy**: chỉ nội dung người dùng
 * chủ động nhờ AI phản hồi mới được gửi lên API. Phân tích tương quan
 * (FR-PS-05) chạy **100% cục bộ**.
 *
 * ⚠️ P3 + Registry C4/C5 — entity nhật ký là `Reflection`:
 *   - bản nháp (`status = "draft"`) **không** tạo `Activity` ⇒ không tính
 *     vào thống kê hoạt động, không tạo `Evidence`;
 *   - khi commit (`status = "published"`) mới tạo `Activity` + liên kết 1–1.
 */

/* ══ Kiểu dữ liệu ═══════════════════════════════════════════════════════ */

export type JournalContext = "after_study" | "end_of_day" | "end_of_week" | "anytime";

export type JournalStatus = "draft" | "published";

export interface JournalEntry {
  id: string;
  /** Nội dung người dùng viết. */
  answer: string;
  /** Câu hỏi gợi ý đã dùng (nếu có). */
  prompt: string | null;
  /** `draft` | `published`. */
  status: JournalStatus;
  /** Domain đã phân loại (AI-06 hoặc rule cục bộ). */
  domain: string | null;
  /** Skill đã phân loại. */
  skillId: string | null;
  skillName: string | null;
  /** Độ tin cậy phân loại (0–1). */
  confidence: number | null;
  /** Nguồn phân loại: `ai` | `local` | `null` (chưa phân loại). */
  source: "ai" | "local" | null;
  /** Phản hồi AI: tóm tắt 1 câu + 1 câu hỏi sắc. */
  aiSummary: string | null;
  aiQuestion: string | null;
  /** Câu trả lời của người dùng cho câu hỏi sắc (FR-PSJ-10). */
  answerToQuestion: string | null;
  /** Phản hồi AI đã lỗi thời sau khi sửa nhật ký (FR-PSJ-06). */
  feedbackStale: boolean;
  /** Id `Activity` (chỉ có khi `published`). */
  activityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyStateDTO {
  date: string;
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
  note: string | null;
  updatedAt: string | null;
}

export interface SentDataEntry {
  id: string;
  createdAt: string;
  feature: string;
  model: string;
  /** Trích nội dung đã gửi (≤160 ký tự — C13). */
  dataPreview: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  estimatedCost: number;
}

/* ══ Gợi ý câu hỏi theo ngữ cảnh (FR-PSJ-02) ═════════════════════════ */

const CONTEXT_QUESTIONS: Record<JournalContext, string[]> = {
  after_study: [
    "Hôm nay bạn học được gì khác với hôm qua?",
    "Chỗ nào còn chưa hiểu — cần xem lại phần nào?",
    "Nếu mai làm lại bài này, bạn sẽ làm khác ở bước nào?",
  ],
  end_of_day: [
    "Điều gì đã tốt nhất hôm nay?",
    "Điều gì đã mất thời gian mà không đáng?",
    "Ngày mai bạn sẽ bắt đầu bằng việc gì?",
  ],
  end_of_week: [
    "Tuần này bạn tiến bộ ở đâu?",
    "Điều gì cứ lặp lại mà chưa tiến?",
    "Tuần sau ưu tiên sẽ là gì?",
  ],
  anytime: [
    "Bạn đang nghĩ gì về việc vừa làm?",
    "Có gì muốn ghi lại để không quên?",
    "Điều gì đang làm bạn chậm lại?",
  ],
};

/**
 * Ngữ cảnh theo giờ trong ngày + ngày trong tuần (FR-PSJ-02).
 *
 * - Thứ 7–Chủ nhật → *cuối tuần*
 * - 8:00–13:00 → *sau buổi học*
 * - 19:00–23:00 → *cuối ngày*
 */
export function resolveJournalContext(date: Date = new Date()): JournalContext {
  const day = date.getDay();
  if (day === 0 || day === 6) return "end_of_week";

  const hour = date.getHours();
  if (hour >= 8 && hour < 13) return "after_study";
  if (hour >= 19 && hour < 23) return "end_of_day";

  return "anytime";
}

/** 3 câu hỏi gợi ý theo ngữ cảnh. */
export function getContextQuestions(context: JournalContext): string[] {
  return CONTEXT_QUESTIONS[context];
}

/* ══ Phân loại cục bộ (FR-PSJ-11, RB-03) ════════════════════════════════ */

/** 4 domain đóng băng — nguồn chân lý: `.kiro/steering/design-system.md`. */
export const JOURNAL_DOMAINS = [
  "chuyên_môn",
  "ngoại_ngữ",
  "giao_tiếp",
  "cá_nhân",
] as const;

export type JournalDomain = (typeof JOURNAL_DOMAINS)[number];

/**
 * Bảng từ khoá phân loại cục bộ — không cần AI (RB-03).
 *
 * ⚠️ Luôn trả `source: "local"` — UI **không** được ghi "AI".
 */
const DOMAIN_KEYWORDS: Record<JournalDomain, string[]> = {
  chuyên_môn: [
    "java",
    "spring",
    "backend",
    "api",
    "database",
    "sql",
    "prisma",
    "code",
    "bug",
    "deploy",
    "refactor",
    "test",
  ],
  ngoại_ngữ: [
    "english",
    "tiếng anh",
    "tieng anh",
    "chinese",
    "tiếng trung",
    "tieng trung",
    "vocabulary",
    "grammar",
    "từ vựng",
    "ngữ pháp",
    "srs",
    "flashcard",
  ],
  giao_tiếp: [
    "interview",
    "phỏng vấn",
    "phong van",
    "meeting",
    "cuộc họp",
    "email",
    "presentation",
    "thuyết trình",
    "negotiation",
    "đàm phán",
    "dam phan",
    "mock",
  ],
  cá_nhân: [
    "ngủ",
    "ngu",
    "mệt",
    "met",
    "stress",
    "áp lực",
    "ap luc",
    "cân bằng",
    "can bang",
    "sức lượng",
    "giấc ngủ",
    "giac ngu",
  ],
};

/**
 * Phân loại domain bằng rule cục bộ (RB-03, FR-PSJ-11).
 *
 * ⚠️ Luôn trả `source: "local"` — không giả lập AI.
 */
export function classifyLocally(text: string): {
  domain: JournalDomain;
  confidence: number;
  source: "local";
} {
  const normalized = text.toLowerCase();

  let bestDomain: JournalDomain = "cá_nhân";
  let bestHits = 0;

  for (const domain of JOURNAL_DOMAINS) {
    const hits = DOMAIN_KEYWORDS[domain].filter((keyword) =>
      normalized.includes(keyword),
    ).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestDomain = domain;
    }
  }

  // Không có từ khoá nào khớp ⇒ mặc định "cá_nhân" với confidence thấp.
  const confidence = bestHits === 0 ? 0.2 : Math.min(0.9, 0.4 + bestHits * 0.15);

  return { domain: bestDomain, confidence, source: "local" };
}

/* ══ Nhật ký ════════════════════════════════════════════════════════════ */

const REFLECTION_SELECT = {
  id: true,
  answer: true,
  prompt: true,
  status: true,
  aiFeedback: true,
  classifiedDomain: true,
  classifiedSkillId: true,
  classificationConfidence: true,
  activityId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Parse JSON phản hồi AI — trả `null` nếu lỗi. */
function parseFeedback(raw: string | null): {
  summary: string | null;
  question: string | null;
} {
  if (!raw) return { summary: null, question: null };

  try {
    const parsed = JSON.parse(raw) as { summary?: string; sharpQuestion?: string };
    return {
      summary: parsed.summary ?? null,
      question: parsed.sharpQuestion ?? null,
    };
  } catch {
    return { summary: null, question: null };
  }
}

/** Chuyển row `Reflection` → DTO. */
function toEntry(row: {
  id: string;
  answer: string;
  prompt: string;
  status: string;
  aiFeedback: string | null;
  classifiedDomain: string | null;
  classifiedSkillId: string | null;
  classificationConfidence: number | null;
  activityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): JournalEntry {
  const feedback = parseFeedback(row.aiFeedback);

  return {
    id: row.id,
    answer: row.answer,
    prompt: row.prompt || null,
    status: row.status === "draft" ? "draft" : "published",
    domain: row.classifiedDomain,
    skillId: row.classifiedSkillId,
    // ⚠️ `Reflection` không có quan hệ FK tới `Skill` — chỉ có scalar
    // `classifiedSkillId`. Tên skill được bổ sung ở `getJournalEntry`.
    skillName: null,
    confidence: row.classificationConfidence,
    source: row.classificationConfidence === null ? null : "local",
    aiSummary: feedback.summary,
    aiQuestion: feedback.question,
    answerToQuestion: null,
    // Phản hồi "lỗi thời" = đã từng có phản hồi nhưng nay không còn.
    feedbackStale: false,
    activityId: row.activityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Tạo / cập nhật **bản nháp** nhật ký (FR-PSJ-01).
 *
 * ⚠️ Bản nháp KHÔNG tạo `Activity` ⇒ không tính vào thống kê hoạt động,
 * không tạo `Evidence` (P3).
 */
export async function saveJournalDraft(input: {
  answer: string;
  prompt?: string;
  id?: string | null;
}): Promise<JournalEntry> {
  const answer = input.answer.trim();
  if (answer.length === 0) throw new Error("empty_answer");

  // Cập nhật bản nháp cũ.
  if (input.id) {
    const existing = await prisma.reflection.findUnique({
      where: { id: input.id },
      select: { id: true, status: true },
    });

    if (existing?.status === "draft") {
      await prisma.reflection.update({
        where: { id: existing.id },
        data: {
          answer,
          prompt: input.prompt ?? "",
          draftUpdatedAt: new Date(),
          // ⚠️ FR-PSJ-06 — sửa nhật ký đã có phản hồi ⇒ xoá phản hồi cũ
          // (UI hiện badge "lỗi thời"), KHÔNG tự gửi lại AI.
          aiFeedback: null,
        },
      });

      return getJournalEntry(existing.id);
    }
  }

  // Tạo bản nháp mới.
  const created = await prisma.reflection.create({
    data: {
      answer,
      prompt: input.prompt ?? "",
      status: "draft",
      draftUpdatedAt: new Date(),
    },
    select: REFLECTION_SELECT,
  });

  return toEntry(created);
}

/** Đọc 1 mục nhật ký. */
export async function getJournalEntry(id: string): Promise<JournalEntry> {
  const row = await prisma.reflection.findUnique({
    where: { id },
    select: REFLECTION_SELECT,
  });

  if (!row) throw new Error("journal_not_found");

  const entry = toEntry(row);

  // ⚠️ Tên skill: `Reflection` chỉ có scalar `classifiedSkillId` (không FK)
  // ⇒ query riêng thay vì nested select.
  if (entry.skillId) {
    const skill = await prisma.skill.findUnique({
      where: { id: entry.skillId },
      select: { name: true },
    });
    entry.skillName = skill?.name ?? null;
  }

  return entry;
}

/**
 * Commit nhật ký ⇒ `status = "published"` + tạo `Activity` (+ `Evidence` nếu có skill).
 *
 * ⚠️ P3 — nhật ký chỉ thành hoạt động khi commit.
 */
export async function commitJournal(input: {
  id: string;
  skillId?: string | null;
}): Promise<JournalEntry> {
  const reflection = await prisma.reflection.findUnique({
    where: { id: input.id },
    select: { id: true, answer: true, prompt: true, status: true, activityId: true },
  });

  if (!reflection) throw new Error("journal_not_found");
  if (reflection.status === "published" && reflection.activityId) {
    // Đã commit ⇒ idempotent.
    return getJournalEntry(input.id);
  }

  const skillId = input.skillId ?? null;

  const activity = await prisma.activity.create({
    data: {
      domain: "personal",
      type: "journal",
      minutes: 0,
      title: reflection.answer.slice(0, 160),
      content: reflection.answer,
      skillId,
    },
    select: { id: true },
  });

  await prisma.reflection.update({
    where: { id: reflection.id },
    data: {
      status: "published",
      activityId: activity.id,
      classifiedSkillId: skillId,
      draftUpdatedAt: null,
    },
  });

  // Tạo Evidence nếu đã gán skill (FR-PSJ-11) — dùng `recordEvidence` để
  // level tính lại đúng.
  if (skillId) {
    await recordEvidence({
      skillId,
      activityId: activity.id,
      rating: EVIDENCE_RATING_MIN,
    });
  }

  return getJournalEntry(input.id);
}

/**
 * Ghi phản hồi AI cho nhật ký (FR-PSJ-03).
 *
 * ⚠️ Đây là hành động **duy nhất** được phép đưa nội dung nhật ký ra khỏi
 * máy. Mỗi lần ghi đều tạo 1 dòng `AiCall` (wrapper AI đã lo).
 */
export async function saveAiFeedback(input: {
  reflectionId: string;
  summary: string;
  question: string;
}): Promise<JournalEntry> {
  const reflection = await prisma.reflection.findUnique({
    where: { id: input.reflectionId },
    select: { id: true },
  });

  if (!reflection) throw new Error("journal_not_found");

  const payload = JSON.stringify({
    summary: input.summary,
    sharpQuestion: input.question,
  });

  await prisma.reflection.update({
    where: { id: reflection.id },
    data: { aiFeedback: payload },
  });

  return getJournalEntry(input.reflectionId);
}

/**
 * Ghi câu trả lời cho câu hỏi sắc (FR-PSJ-10).
 *
 * ⚠️ Lưu vào `Reflection` — KHÔNG tạo `Activity` mới.
 */
export async function saveJournalAnswer(input: {
  reflectionId: string;
  answer: string;
}): Promise<JournalEntry> {
  const answer = input.answer.trim();
  if (answer.length === 0) throw new Error("empty_answer");

  const reflection = await prisma.reflection.findUnique({
    where: { id: input.reflectionId },
    select: { id: true, answer: true, aiFeedback: true },
  });

  if (!reflection) throw new Error("journal_not_found");
  if (!reflection.aiFeedback) throw new Error("no_feedback_to_answer");

  // Lưu câu trả lời nối vào nội dung gốc.
  await prisma.reflection.update({
    where: { id: reflection.id },
    data: { answer: `${reflection.answer}\n\n— Trả lời: ${answer}` },
  });

  return getJournalEntry(input.reflectionId);
}

/**
 * Phân loại nhật ký bằng rule cục bộ (FR-PSJ-11, RB-03).
 *
 * ⚠️ Không gọi AI — luôn `source: "local"`.
 */
export async function classifyJournalLocal(
  reflectionId: string,
): Promise<JournalEntry> {
  const reflection = await prisma.reflection.findUnique({
    where: { id: reflectionId },
    select: { id: true, answer: true },
  });

  if (!reflection) throw new Error("journal_not_found");

  const result = classifyLocally(reflection.answer);

  await prisma.reflection.update({
    where: { id: reflection.id },
    data: {
      classifiedDomain: result.domain,
      classificationConfidence: result.confidence,
    },
  });

  return getJournalEntry(reflectionId);
}

/**
 * Chấp nhận gợi ý phân loại ⇒ tạo `Evidence` rating 3 (FR-PSJ-11).
 *
 * ⚠️ P3 — dùng `recordEvidence` để level được tính lại đúng.
 */
export async function acceptClassification(input: {
  reflectionId: string;
  skillId: string;
}): Promise<{ evidenceId: string; level: number }> {
  const reflection = await prisma.reflection.findUnique({
    where: { id: input.reflectionId },
    select: { id: true, activityId: true },
  });

  if (!reflection) throw new Error("journal_not_found");

  const skill = await prisma.skill.findUnique({
    where: { id: input.skillId },
    select: { id: true },
  });
  if (!skill) throw new Error("skill_not_found");

  // Evidence cần `activityId` ⇒ nhật ký phải đã commit.
  if (!reflection.activityId) throw new Error("journal_not_committed");

  // Idempotent: không tạo trùng Evidence cùng activityId.
  const existing = await prisma.evidence.findFirst({
    where: { activityId: reflection.activityId, skillId: input.skillId },
    select: { id: true },
  });

  if (existing) {
    return { evidenceId: existing.id, level: 0 };
  }

  const result = await recordEvidence({
    skillId: input.skillId,
    activityId: reflection.activityId,
    rating: EVIDENCE_RATING_MIN,
  });

  return { evidenceId: result.evidenceId, level: result.level };
}

/**
 * Danh sách nhật ký — cursor pagination `(createdAt, id)`.
 */
export async function listJournal(input: {
  limit?: number;
  cursor?: string | null;
  status?: JournalStatus;
}): Promise<{ items: JournalEntry[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const status = input.status ?? "published";

  const rows = await prisma.reflection.findMany({
    where: { status },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor
      ? {
          cursor: { id: input.cursor },
          skip: 1,
        }
      : {}),
    select: REFLECTION_SELECT,
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toEntry);

  return {
    items,
    nextCursor: hasMore ? (rows[limit - 1]?.id ?? null) : null,
  };
}

/**
 * Bản nháp đang mở (mới nhất) — hoặc `null`.
 */
export async function getDraft(): Promise<JournalEntry | null> {
  const row = await prisma.reflection.findFirst({
    where: { status: "draft" },
    orderBy: { draftUpdatedAt: "desc" },
    select: REFLECTION_SELECT,
  });

  return row ? toEntry(row) : null;
}

/** Xoá bản nháp. */
export async function deleteDraft(id: string): Promise<void> {
  await prisma.reflection.deleteMany({
    where: { id, status: "draft" },
  });
}

/* ══ Đánh giá chính (S12) ════════════════════════════════════════════════ */

/** Đọc chỉ số chính theo ngày. */
export async function getDailyState(date: Date): Promise<DailyStateDTO> {
  const row = await prisma.dailyState.findUnique({
    where: { date: normalizeDate(date) },
    select: {
      date: true,
      mood: true,
      energy: true,
      sleep: true,
      focus: true,
      note: true,
      updatedAt: true,
    },
  });

  return {
    date: toDateKey(date),
    mood: row?.mood ?? null,
    energy: row?.energy ?? null,
    sleep: row?.sleep ?? null,
    focus: row?.focus ?? null,
    note: row?.note ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/**
 * Lưu chỉ số chính — upsert theo ngày (FR-PSJ-08).
 *
 * Ghi nhiều lần trong ngày chỉ giữ bản ghi mới nhất.
 */
export async function saveDailyState(input: {
  date: Date;
  mood?: number | null;
  energy?: number | null;
  sleep?: number | null;
  focus?: number | null;
  note?: string | null;
}): Promise<DailyStateDTO> {
  const day = normalizeDate(input.date);

  await prisma.dailyState.upsert({
    where: { date: day },
    create: {
      date: day,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      sleep: input.sleep ?? null,
      focus: input.focus ?? null,
      note: input.note ?? null,
    },
    update: {
      ...(input.mood !== undefined ? { mood: input.mood } : {}),
      ...(input.energy !== undefined ? { energy: input.energy } : {}),
      ...(input.sleep !== undefined ? { sleep: input.sleep } : {}),
      ...(input.focus !== undefined ? { focus: input.focus } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  return getDailyState(input.date);
}

/**
 * Prefill chỉ số từ bản ghi gần nhất trước hôm nay (FR-PSJ-07).
 *
 * Nếu chưa có dữ liệu ⇒ mặc định 3/3/3 và 0 giờ ngủ.
 */
export async function getPrefillState(date: Date = new Date()): Promise<DailyStateDTO> {
  const today = normalizeDate(date);

  const previous = await prisma.dailyState.findFirst({
    where: { date: { lt: today } },
    orderBy: { date: "desc" },
    select: { mood: true, energy: true, sleep: true, focus: true },
  });

  if (!previous) {
    return {
      date: toDateKey(date),
      mood: 3,
      energy: 3,
      sleep: 0,
      focus: 3,
      note: null,
      updatedAt: null,
    };
  }

  return {
    date: toDateKey(date),
    mood: previous.mood ?? 3,
    energy: previous.energy ?? 3,
    sleep: previous.sleep ?? 0,
    focus: previous.focus ?? 3,
    note: null,
    updatedAt: null,
  };
}

/**
 * Chuỗi chỉ số theo ngày + số hành động hoàn thành (FR-PS-06).
 */
export async function getStateSeries(days: number): Promise<
  Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    sleep: number | null;
    focus: number | null;
    doneSlots: number;
  }>
> {
  const today = normalizeDate(new Date());
  const from = addDays(today, -(days - 1));

  const [states, planItems] = await Promise.all([
    prisma.dailyState.findMany({
      where: { date: { gte: from, lte: today } },
      select: { date: true, mood: true, energy: true, sleep: true, focus: true },
    }),
    prisma.planItem.findMany({
      where: { date: { gte: from, lte: today } },
      select: { date: true, done: true },
    }),
  ]);

  const stateByDate = new Map(states.map((s) => [toDateKey(s.date), s]));

  const doneByDate = new Map<string, number>();
  for (const item of planItems) {
    if (!item.done) continue;
    const key = toDateKey(item.date);
    doneByDate.set(key, (doneByDate.get(key) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, index) => {
    const day = addDays(from, index);
    const key = toDateKey(day);
    const state = stateByDate.get(key);

    return {
      date: key,
      mood: state?.mood ?? null,
      energy: state?.energy ?? null,
      sleep: state?.sleep ?? null,
      focus: state?.focus ?? null,
      doneSlots: doneByDate.get(key) ?? 0,
    };
  });
}

/**
 * Phân tích tương quan chỉ số ↔ hiệu suất — **100% cục bộ** (FR-PS-05, FR-PS-07).
 *
 * ⚠️ Không gọi AI. Chỉ dùng dữ liệu `DailyState` + `PlanItem` trong SQLite.
 */
export function analyzeCorrelation(
  series: ReadonlyArray<{
    mood: number | null;
    energy: number | null;
    sleep: number | null;
    focus: number | null;
    doneSlots: number;
  }>,
): Array<{
  metric: "sleep" | "mood" | "energy" | "focus";
  label: string;
  /** Hệ số tương quan Pearson (−1..1). */
  correlation: number;
  /** Số mẫu dùng để tính. */
  samples: number;
  /** Diễn giải ngắn (tiếng Việt). */
  insight: string;
}> {
  const metrics = [
    { key: "sleep" as const, label: "Giấc ngủ" },
    { key: "mood" as const, label: "Tâm trạng" },
    { key: "energy" as const, label: "Năng lượng" },
    { key: "focus" as const, label: "Tập trung" },
  ];

  return metrics.map((metric) => {
    const points: Array<{ x: number; y: number }> = [];

    for (const day of series) {
      const x = day[metric.key];
      if (x === null || x === undefined) continue;
      points.push({ x, y: day.doneSlots });
    }

    const correlation = pearson(points);
    const samples = points.length;

    let insight: string;
    if (samples < 3) {
      insight = "Chưa đủ dữ liệu để tìm quan hệ (cần ít nhất 3 ngày có cả 2 chỉ số).";
    } else if (correlation >= 0.5) {
      insight = `${metric.label} cao đi kèm nhiều hành động hoàn thành hơn.`;
    } else if (correlation <= -0.5) {
      insight = `${metric.label} cao lại đi kèm ít hành động hoàn thành hơn — có thể cần nghỉ.`;
    } else {
      insight = `${metric.label} không cho thấy quan hệ rõ với số hành động hoàn thành.`;
    }

    return {
      metric: metric.key,
      label: metric.label,
      correlation,
      samples,
      insight,
    };
  });
}

/**
 * Hệ số tương quan Pearson — hàm thuần, test được.
 */
export function pearson(points: ReadonlyArray<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;

  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  if (denomX === 0 || denomY === 0) return 0;

  return Number((numerator / Math.sqrt(denomX * denomY)).toFixed(3));
}

/* ══ Dữ liệu đã gửi lên (FR-PSJ-04) ═════════════════════════════════════ */

/**
 * Panel "Dữ liệu đã gửi lên" — liệt kê mọi lần gửi lên API.
 *
 * ⚠️ FR-PS-07 — cho phép xoá log (không xoá dữ liệu gốc).
 */
export async function listSentData(limit = 50): Promise<SentDataEntry[]> {
  const rows = await prisma.aiCall.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      feature: true,
      model: true,
      dataPreview: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      estimatedCost: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    feature: row.feature,
    model: row.model,
    dataPreview: row.dataPreview,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheRead: row.cacheRead,
    estimatedCost: row.estimatedCost,
  }));
}

/** Xoá 1 dòng log "đã gửi lên" (không xoá dữ liệu gốc). */
export async function deleteSentData(id: string): Promise<void> {
  await prisma.aiCall.delete({ where: { id } }).catch(() => {
    // Đã bị xoá ⇒ không cần báo lỗi.
  });
}
