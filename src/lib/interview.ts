/**
 * Kiểu & hằng số dùng chung cho feature `mock-interview`.
 *
 * ⚠️ T12 (design.md §7) — `QuestionKind` chỉ được khai báo **một lần duy nhất**
 * ở đây. `interview-rubric.ts` và `interview-prompts.ts` cùng import từ đây.
 *
 * Nguồn: `.kiro/specs/mock-interview/spec.md` §3.4, §5.1–§5.3 ·
 * `.kiro/steering/user-profile-decisions.md` §6 (AI Interview Studio).
 */

/* ══ Câu hỏi ═══════════════════════════════════════════════════════════════ */

/** 5 dạng câu hỏi (FR-MI-03). Thứ tự = thứ tự ưu tiên phân bổ (spec §3.4). */
export const QUESTION_KINDS = [
  "concept",
  "design",
  "debug",
  "tradeoff",
  "behavioral",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  concept: "Kiến thức nền",
  design: "Thiết kế hệ thống",
  debug: "Điều tra sự cố",
  tradeoff: "Đánh đổi quyết định",
  behavioral: "Hành vi theo STAR",
};

/** Mô tả ngắn dạng câu — hiển thị ở S16 (spec §3.4). */
export const QUESTION_KIND_DESCRIPTIONS: Record<QuestionKind, string> = {
  concept: "Kiểm tra hiểu biết nguyên lý, khái niệm, cơ chế nền.",
  design: "Thiết kế giải pháp cho bài toán có ràng buộc quy mô.",
  debug: "Điều tra từ triệu chứng tới nguyên nhân gốc.",
  tradeoff: "Chọn giữa hai phương án và nêu rõ cái giá phải trả.",
  behavioral: "Kể một tình huống thật theo cấu trúc STAR.",
};

/* ══ Hồ sơ vai trò ══════════════════════════════════════════════════════════ */

export const SENIORITIES = ["junior", "mid", "senior", "lead"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
};

/** Ngôn ngữ phỏng vấn (FR-MI-01). */
export const INTERVIEW_LANGUAGES = ["en", "zh", "vi"] as const;
export type InterviewLanguage = (typeof INTERVIEW_LANGUAGES)[number];

export const INTERVIEW_LANGUAGE_LABELS: Record<InterviewLanguage, string> = {
  en: "Tiếng Anh",
  zh: "Tiếng Trung",
  vi: "Tiếng Việt",
};

/** Phương thức trả lời (FR-MI-07). */
export const ANSWER_MODES = ["text", "voice"] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export const ANSWER_MODE_LABELS: Record<AnswerMode, string> = {
  text: "Văn bản",
  voice: "Giọng nói",
};

/* ══ Phiên ══════════════════════════════════════════════════════════════════ */

export const SESSION_STATUSES = ["active", "paused", "done", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn thành",
  abandoned: "Đã bỏ",
};

/**
 * 3 loại phiên của AI Interview Studio (FR-MI-15, registry `C30`).
 * - `skill_drill`   — hỏi sâu 1 mục kỹ năng.
 * - `interview_loop` — vòng tròn tuyến tính giới thiệu → chuyên môn → hệ thống → hỏi ngược.
 * - `partner_sim`   — AI đóng vai đối tác/sếp/khách hàng (KHÔNG phải interviewer).
 */
export const SESSION_TYPES = ["skill_drill", "interview_loop", "partner_sim"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  skill_drill: "Vòng lặp kỹ năng",
  interview_loop: "Vòng tròn tuyến tính",
  partner_sim: "Mô phỏng đối tác",
};

export const SESSION_TYPE_DESCRIPTIONS: Record<SessionType, string> = {
  skill_drill: "Hỏi sâu 1 mục kỹ năng cụ thể trong cây.",
  interview_loop: "Giới thiệu → chuyên môn → hệ thống → hỏi ngược.",
  partner_sim: "AI đóng vai đối tác/sếp/khách hàng, không phải interviewer.",
};

/** Vai trò AI đóng khi `sessionType = "partner_sim"`. */
export const PARTNER_ROLES = ["tech_partner", "manager", "customer"] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export const PARTNER_ROLE_LABELS: Record<PartnerRole, string> = {
  tech_partner: "Đối tác kỹ thuật",
  manager: "Quản lý trực tiếp",
  customer: "Khách hàng",
};

/** Số câu hỏi của 1 phiên (FR-MI-12). */
export const PLANNED_COUNTS = [5, 8, 12] as const;
export type PlannedCount = (typeof PLANNED_COUNTS)[number];

/* ══ Rubric ═════════════════════════════════════════════════════════════════ */

/** 5 tiêu chí rubric kỹ thuật (FR-MI-04). */
export const RUBRIC_KEYS = [
  "accuracy",
  "depth",
  "reasoning",
  "communication",
  "tradeoff",
] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

/** 4 tiêu chí rubric hành vi (FR-MI-05). */
export const BEHAVIORAL_RUBRIC_KEYS = [
  "specific",
  "star",
  "selfaware",
  "outcome",
] as const;
export type BehavioralRubricKey = (typeof BEHAVIORAL_RUBRIC_KEYS)[number];

/** Điểm 1 tiêu chí — luôn kèm lý do (NFR-MI-08). */
export interface CriterionScore {
  /** 0..5 — server clamp về biên. */
  readonly score: number;
  /** 1–2 câu giải thích dựa trên câu trả lời. */
  readonly note: string;
}

export type ScoresJson = Record<RubricKey, CriterionScore>;
export type BehavioralScoresJson = Record<BehavioralRubricKey, CriterionScore>;

/** Thang điểm rubric. */
export const RUBRIC_SCORE_MIN = 0;
export const RUBRIC_SCORE_MAX = 5;

/** Thang `Evidence.rating` (1..4). */
export const EVIDENCE_RATING_MIN = 1;
export const EVIDENCE_RATING_MAX = 4;

/* ══ Parse / serialize cột JSON-string của Prisma ═══════════════════════════ */

/**
 * `InterviewProfile.questionKinds` lưu dạng chuỗi CSV (`"concept,design"`).
 * Parse an toàn: giá trị lạ bị loại, không throw.
 */
export function parseQuestionKinds(raw: string | null | undefined): QuestionKind[] {
  if (!raw) return [];
  const valid = new Set<string>(QUESTION_KINDS);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is QuestionKind => valid.has(part));
}

/** `InterviewProfile.focusSkills` / `InterviewSession.skillsFocused` lưu JSON array. */
export function parseSkillIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

/** Serialize danh sách skillId thành JSON array. */
export function serializeSkillIds(ids: readonly string[]): string {
  return JSON.stringify([...ids]);
}

/** Chuẩn hoá `seniority` — giá trị lạ ⇒ `mid`. */
export function parseSeniority(raw: string | null | undefined): Seniority {
  return (SENIORITIES as readonly string[]).includes(raw ?? "")
    ? (raw as Seniority)
    : "mid";
}

/** Chuẩn hoá `language` — giá trị lạ ⇒ `en`. */
export function parseInterviewLanguage(raw: string | null | undefined): InterviewLanguage {
  return (INTERVIEW_LANGUAGES as readonly string[]).includes(raw ?? "")
    ? (raw as InterviewLanguage)
    : "en";
}

/** Chuẩn hoá `answerMode` — giá trị lạ ⇒ `text`. */
export function parseAnswerMode(raw: string | null | undefined): AnswerMode {
  return (ANSWER_MODES as readonly string[]).includes(raw ?? "") ? (raw as AnswerMode) : "text";
}

/** Chuẩn hoá `status` — giá trị lạ ⇒ `active`. */
export function parseSessionStatus(raw: string | null | undefined): SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as SessionStatus)
    : "active";
}

/** Chuẩn hoá `sessionType` — giá trị lạ ⇒ `interview_loop`. */
export function parseSessionType(raw: string | null | undefined): SessionType {
  return (SESSION_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as SessionType)
    : "interview_loop";
}

/** Chuẩn hoá `kind` của turn — giá trị lạ ⇒ `concept`. */
export function parseQuestionKind(raw: string | null | undefined): QuestionKind {
  return (QUESTION_KINDS as readonly string[]).includes(raw ?? "")
    ? (raw as QuestionKind)
    : "concept";
}
