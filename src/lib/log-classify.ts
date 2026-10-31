import { prisma } from "@/lib/db";
import type { LogDomain, LogLanguage, LogType } from "@/lib/log";

/**
 * Rule cục bộ phân loại hoạt động — **fallback offline** cho AI-02 (FR-QL-13).
 *
 * ⚠️ P5 — cục bộ trước: khi không có API key, autofill vẫn phải điền được
 * domain + kỹ năng + thời lượng, chỉ là badge nguồn đổi từ "AI" sang
 * "Rule cục bộ".
 *
 * ⚠️ Không phụ thuộc AI ⇒ hàm thuần, test được không cần mạng.
 */

export interface ClassifyInput {
  /** Mô tả người dùng gõ (≥ 3 ký tự). */
  text: string;
  /** Domain do người dùng chọn (preset hoặc sửa tay). */
  domain: LogDomain;
  /** Ngôn ngữ (nếu hoạt động ngoại ngữ). */
  language?: LogLanguage | null;
}

export interface ClassifyResult {
  domain: LogDomain;
  /** Kỹ năng gắn (null = không tìm thấy kỹ năng phù hợp). */
  skillId: string | null;
  skillName: string | null;
  /** Thời lượng (phút). */
  minutes: number;
  /** Mức độ khó 1–4. */
  difficulty: number;
  /** Ngôn ngữ (chỉ hoạt động ngoại ngữ). */
  language: LogLanguage | null;
}

/* ══ Bảng từ khoá ════════════════════════════════════════════════════════ */

/** Từ khoá → loại hoạt động. Thứ tự quan trọng: khớp trước thắng trước. */
const TYPE_KEYWORDS: Array<{ type: LogType; keywords: string[] }> = [
  { type: "srs", keywords: ["srs", "flashcard", "ôn tập", "on tap", "review", "thẻ"] },
  { type: "speak", keywords: ["nói", "noi", "speak", "talk", "thuyết trình", "phỏng vấn", "interview"] },
  { type: "write", keywords: ["viết", "viet", "write", "essay", "bài", "email"] },
  { type: "journal", keywords: ["nhật ký", "nhat ky", "journal", "ghi chú", "phản tư", "phan tu"] },
  { type: "health", keywords: ["chạy", "chay", "gym", "tập", "tap", "đi bộ", "di bo", "ngủ", "ngu", "yoga", "thể chất"] },
  { type: "study", keywords: ["học", "hoc", "study", "đọc", "doc", "xem", "làm bài"] },
];

/** Từ khoá → mức độ khó (1 dễ … 4 khó). */
const DIFFICULTY_KEYWORDS: Array<{ difficulty: number; keywords: string[] }> = [
  { difficulty: 4, keywords: ["nâng cao", "nang cao", "chuyên sâu", "chuyen sau", "khó", "kho", "advanced", "expert"] },
  { difficulty: 3, keywords: ["ởn", "on", "fix", "debug", "tối ưu", "toi uu", "optimize", "refactor"] },
  { difficulty: 1, keywords: ["xem lại", "xem lai", "review", "đọc lại", "doc lai", "basic", "cơ bản", "co ban"] },
];

/** Thời lượng mặc định theo loại hoạt động (phút). */
const DEFAULT_MINUTES: Record<LogType, number> = {
  study: 30,
  write: 25,
  speak: 20,
  srs: 15,
  journal: 10,
  health: 20,
  custom: 20,
};

/* ══ Hàm thuần ══════════════════════════════════════════════════════════ */

/**
 * Suy ra loại hoạt động từ mô tả.
 *
 * Trả `null` khi không khớp từ khoá nào ⇒ caller dùng loại mặc định theo domain.
 */
export function inferType(text: string): LogType | null {
  const normalized = text.toLowerCase();

  for (const entry of TYPE_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.type;
    }
  }

  return null;
}

/** Suy ra mức độ khó 1–4 từ mô tả. Mặc định 2 (trung bình). */
export function inferDifficulty(text: string): number {
  const normalized = text.toLowerCase();

  for (const entry of DIFFICULTY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.difficulty;
    }
  }

  return 2;
}

/**
 * Suy ra ngôn ngữ từ mô tả (chỉ hoạt động ngoại ngữ).
 *
 * ⚠️ Q2 — `vi` là **bản ngữ** ⇒ không phải hoạt động luyện ngoại ngữ.
 */
export function inferLanguage(text: string): LogLanguage | null {
  const normalized = text.toLowerCase();

  if (/\b(en|english|tiếng anh|tieng anh)\b/.test(normalized)) return "en";
  if (/\b(zh|cn|chinese|tiếng trung|tieng trung|hanzi)\b/.test(normalized)) return "zh";
  if (/\b(vi|vietnamese|tiếng việt|tieng viet)\b/.test(normalized)) return "vi";

  return null;
}

/**
 * Loại hoạt động mặc định theo domain (dùng khi không khớp từ khoá).
 */
export function defaultTypeForDomain(domain: LogDomain): LogType {
  switch (domain) {
    case "professional":
      return "study";
    case "communication":
      return "speak";
    case "language":
      return "srs";
    case "personal":
      return "health";
  }
}

/**
 * Phân loại bằng rule cục bộ — **không gọi AI** (FR-QL-13).
 *
 * @param skills danh sách kỹ năng để khớp theo tên (không khớp được ⇒ null).
 */
export function classifyByRule(
  input: ClassifyInput,
  skills: ReadonlyArray<{ id: string; name: string; domain: string }>,
): ClassifyResult {
  const type = inferType(input.text) ?? defaultTypeForDomain(input.domain);
  const difficulty = inferDifficulty(input.text);

  // Khớp kỹ năng theo tên (chứa chuỗi con của mô tả).
  const normalized = input.text.toLowerCase();
  const candidates = skills.filter((skill) => skill.domain === input.domain);

  let best: { id: string; name: string } | null = null;
  let bestLength = 0;

  for (const skill of candidates) {
    const name = skill.name.toLowerCase();
    if (name.length >= 3 && normalized.includes(name) && name.length > bestLength) {
      best = skill;
      bestLength = name.length;
    }
  }

  const language =
    input.domain === "language" ? (input.language ?? inferLanguage(input.text)) : null;

  return {
    domain: input.domain,
    skillId: best?.id ?? null,
    skillName: best?.name ?? null,
    minutes: DEFAULT_MINUTES[type],
    difficulty,
    language,
  };
}

/**
 * Phân loại bằng rule cục bộ + truy vấn kỹ năng từ DB.
 */
export async function classifyLocally(input: ClassifyInput): Promise<ClassifyResult> {
  const skills = await prisma.skill.findMany({
    where: { domain: input.domain },
    select: { id: true, name: true, domain: true },
  });

  return classifyByRule(input, skills);
}
