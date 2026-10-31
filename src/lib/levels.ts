/**
 * Thang trình độ ngôn ngữ — nguồn chân lý duy nhất (Registry C29, C32).
 *
 * ⚠️ Task 35.4 — mọi nơi hiển thị mức ngôn ngữ phải lấy từ đây.
 *
 * ⚠️ Task 35.3 — thang level là **CEFR đầy đủ**: `zero · A1 · A2 · B1 · B2 · C1 · C2`.
 * Đã bỏ `beginner` / `elementary` / `intermediate` / `upper_intermediate`.
 */

/** Thang CEFR đầy đủ — `zero` = chưa học (chỉ dùng cho tiếng Trung). */
export const CEFR_LEVELS = [
  "zero",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

/** Thang HSK đầy đủ (tiếng Trung). */
export const HSK_LEVELS = [
  "zero",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type HskLevel = (typeof HSK_LEVELS)[number];

/** Thứ tự tăng dần — dùng để so sánh. */
export const LEVEL_ORDER: readonly string[] = [
  "zero",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
];

/** Nhãn tiếng Việt cho từng mức CEFR. */
export const CEFR_LABELS: Record<string, string> = {
  zero: "Chưa học",
  A1: "Sơ cấp — chào hỏi, giới thiệu bản thân",
  A2: "Sơ cấp — giao tiếp viển móc",
  B1: "Trung cấp — xử lý tình huống quen thuộc",
  B2: "Trung cấp — thảo luận, viết rõ ràng",
  C1: "Cao cấp — dùng linh hoạt, chính xác",
  C2: "Cao cấp — thành thạo, tự nhiên",
};

/** Nhãn tiếng Việt cho từng mức HSK. */
export const HSK_LABELS: Record<string, string> = {
  zero: "Chưa học",
  "1": "HSK 1 — 150 từ",
  "2": "HSK 2 — 300 từ",
  "3": "HSK 3 — 600 từ",
  "4": "HSK 4 — 1000 từ",
  "5": "HSK 5 — 1800 từ",
  "6": "HSK 6 — 2500 từ",
};

/** Hợp nhất nhãn theo chuẩn đã chọn. */
export const LEVEL_LABELS: Record<string, string> = {
  ...CEFR_LABELS,
  ...HSK_LABELS,
};

/** Mức hợp lệ cho từng ngôn ngữ. */
export function levelsForLanguage(lang: "en" | "zh" | "vi"): readonly string[] {
  // ⚠️ Tiếng Trung dùng HSK; tiếng Anh & Việt dùng CEFR.
  return lang === "zh" ? HSK_LEVELS : CEFR_LEVELS;
}

/** Nhãn hiển thị cho 1 mức + ngôn ngữ. */
export function levelLabel(level: string, lang: "en" | "zh" | "vi"): string {
  if (lang === "zh") return HSK_LABELS[level] ?? level;
  return CEFR_LABELS[level] ?? level;
}

/**
 * Chuẩn hiển thị ưu tiên (Registry C32).
 *
 * - `cefr` ⇒ chỉ CEFR.
 * - `hsk` ⇒ chỉ HSK.
 * - `both` ⇒ cả hai (tiếng Trung hiện cả CEFR lẫn HSK).
 */
export function standardLabel(standard: "cefr" | "hsk" | "both"): string {
  if (standard === "cefr") return "CEFR";
  if (standard === "hsk") return "HSK";
  return "CEFR + HSK";
}

/**
 * Mức hợp lệ cho ngôn ngữ — dùng để validate input.
 */
export function isValidLevel(level: string, lang: "en" | "zh" | "vi"): boolean {
  return levelsForLanguage(lang).includes(level);
}
