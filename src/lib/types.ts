/**
 * Type dùng chung cho toàn app.
 * Nguồn: `.kiro/steering/data-model-registry.md` + `.kiro/steering/user-profile-decisions.md`.
 */

/** 4 domain — đóng băng theo nguyên tắc P5. */
export const DOMAINS = ["professional", "communication", "language", "personal"] as const;
export type DomainKey = (typeof DOMAINS)[number];

/** Loại hoạt động. `mock_interview` + `test` dùng bởi feature tương ứng. */
export const ACTIVITY_TYPES = [
  "study",
  "write",
  "speak",
  "roleplay",
  "srs",
  "journal",
  "health",
  "custom",
  "mock_interview",
  "test",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Thang CEFR — chuẩn duy nhất (Q7). Tiếng Trung hiển thị kèm HSK. */
export const LEVELS = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, { vi: string; cefr: string; hsk: string | null }> = {
  zero: { vi: "Chưa biết", cefr: "—", hsk: "HSK 0" },
  A1: { vi: "Sơ cấp", cefr: "A1", hsk: "HSK 1" },
  A2: { vi: "Cơ bản", cefr: "A2", hsk: "HSK 2" },
  B1: { vi: "Trung cấp", cefr: "B1", hsk: "HSK 3" },
  B2: { vi: "Trung cấp cao", cefr: "B2", hsk: "HSK 4" },
  C1: { vi: "Cao cấp", cefr: "C1", hsk: "HSK 5" },
  C2: { vi: "Cao cấp (thành thạo)", cefr: "C2", hsk: "HSK 6" },
};

/** Chế độ chấm điểm AI. */
export const AI_TONES = ["direct", "coach", "gentle"] as const;
export type AiTone = (typeof AI_TONES)[number];

/** Chế độ thẻ SRS. */
export const CARD_MODES = ["recognize", "recall", "produce"] as const;
export type CardMode = (typeof CARD_MODES)[number];

/** Ngôn ngữ — 3 ngôn ngữ theo Q2. */
export const LANGUAGES = ["en", "zh", "vi"] as const;
export type LangCode = (typeof LANGUAGES)[number];

/** Ngôn ngữ có SRS deck (Q2: tiếng Việt là bản ngữ, không học thuộc). */
export const SRS_LANGUAGES = ["en", "zh"] as const;
export type SrsLang = (typeof SRS_LANGUAGES)[number];

/** Chuẩn hiển thị trình độ (Q7). */
export const LANGUAGE_STANDARDS = ["cefr", "hsk", "both"] as const;
export type LanguageStandard = (typeof LANGUAGE_STANDARDS)[number];

/** Nguồn kế hoạch (quy tắc B5). */
export const PLAN_SOURCES = ["ai", "manual", "fallback"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

/** Nhãn domain hiển thị. */
export const DOMAIN_LABELS: Record<DomainKey, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

/** Nhãn loại hoạt động hiển thị. */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  study: "Học",
  write: "Viết",
  speak: "Nói",
  roleplay: "Hội thoại",
  srs: "Ôn tập",
  journal: "Nhật ký",
  health: "Sức khoẻ",
  custom: "Tuỳ chỉnh",
  mock_interview: "Phỏng vấn",
  test: "Kiểm tra",
};
