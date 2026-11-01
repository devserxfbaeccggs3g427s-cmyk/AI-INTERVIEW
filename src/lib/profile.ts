import { prisma } from "@/lib/db";

/**
 * Hồ sơ người dùng (FR-SC-01..07) — tách riêng khỏi `settings.ts`.
 *
 * ⚠️ Spec `settings-cost/design.md` §Service quy định `src/lib/profile.ts`
 * là service riêng: logic thuần, không phụ thuộc React, test được bằng
 * Vitest không cần DOM.
 */

export type AiTone = "direct" | "coach" | "gentle";

export const CEFR_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

export const HSK_LEVELS = ["zero", "1", "2", "3", "4", "5", "6"] as const;
export type LanguageStandard = "cefr" | "hsk" | "both";
export type LanguageCode = "en" | "zh" | "vi";

/**
 * Ngôn ngữ phỏng vấn.
 *
 * ⚠️ Task 35.7 — nhận `zh` ngoài `en`/`vi` (Q2 trong OPEN-QUESTIONS đã chốt:
 * người dùng học 3 ngôn ngữ, phỏng vấn có thể bằng cả 3).
 */
export type InterviewLang = "en" | "zh" | "vi";

export interface UserProfileDTO {
  /** Id hồ sơ — app dùng 1 hồ sơ duy nhất. */
  id: string;
  name: string | null;
  goals: string | null;
  aiTone: AiTone;
  learningLangs: LanguageCode[];
  zhLevel: string;
  enLevel: string;
  viLevel: string;
  languageStandard: LanguageStandard;
  interviewLang: InterviewLang;
  monthlyBudgetUsd: number;
  saverMode: boolean;
  focusSkillId: string | null;
}

/**
 * Đọc hồ sơ — tạo mặc định nếu chưa có (app dùng 1 hồ sơ duy nhất).
 */
export async function getUserProfile(): Promise<UserProfileDTO> {
  const row = await prisma.userProfile.findFirst({ orderBy: { id: "asc" } });

  if (!row) {
    const created = await prisma.userProfile.create({ data: {} });
    return toUserProfileDTO(created);
  }

  return toUserProfileDTO(row);
}

/** Lưu hồ sơ (FR-SC-01..07). */
export async function saveUserProfile(input: {
  name?: string | null;
  goals?: string | null;
  aiTone?: AiTone;
  learningLangs?: LanguageCode[];
  zhLevel?: string;
  enLevel?: string;
  viLevel?: string;
  languageStandard?: LanguageStandard;
  interviewLang?: InterviewLang;
  monthlyBudgetUsd?: number;
  saverMode?: boolean;
}): Promise<UserProfileDTO> {
  const current = await getUserProfile();

  const row = await prisma.userProfile.update({
    where: { id: current.id ?? "default" },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.goals !== undefined ? { goals: input.goals } : {}),
      ...(input.aiTone !== undefined ? { aiTone: input.aiTone } : {}),
      ...(input.learningLangs !== undefined
        ? { learningLangs: input.learningLangs.join(",") }
        : {}),
      ...(input.zhLevel !== undefined ? { zhLevel: input.zhLevel } : {}),
      ...(input.enLevel !== undefined ? { enLevel: input.enLevel } : {}),
      ...(input.viLevel !== undefined ? { viLevel: input.viLevel } : {}),
      ...(input.languageStandard !== undefined
        ? { languageStandard: input.languageStandard }
        : {}),
      ...(input.interviewLang !== undefined
        ? { interviewLang: input.interviewLang }
        : {}),
      ...(input.monthlyBudgetUsd !== undefined
        ? { monthlyBudgetUsd: input.monthlyBudgetUsd }
        : {}),
      ...(input.saverMode !== undefined ? { saverMode: input.saverMode } : {}),
    },
  });

  return toUserProfileDTO(row);
}

/** Parse `learningLangs` (chuỗi CSV) — bỏ giá trị rác. */
function parseLangs(raw: string | null): LanguageCode[] {
  if (!raw) return [];
  const allowed: LanguageCode[] = ["en", "zh", "vi"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is LanguageCode => allowed.includes(s as LanguageCode));
}

function toUserProfileDTO(row: {
  id: string;
  name: string | null;
  goals: string | null;
  aiTone: string;
  learningLangs: string | null;
  zhLevel: string;
  enLevel: string;
  viLevel: string;
  languageStandard: string;
  interviewLang: string;
  monthlyBudgetUsd: number;
  saverMode: boolean;
  focusSkillId: string | null;
}): UserProfileDTO {
  return {
    id: row.id,
    name: row.name,
    goals: row.goals,
    aiTone: (row.aiTone as AiTone) ?? "direct",
    learningLangs: parseLangs(row.learningLangs),
    zhLevel: row.zhLevel,
    enLevel: row.enLevel,
    viLevel: row.viLevel,
    languageStandard: (row.languageStandard as LanguageStandard) ?? "cefr",
    interviewLang: (row.interviewLang as InterviewLang) ?? "en",
    monthlyBudgetUsd: row.monthlyBudgetUsd,
    saverMode: row.saverMode,
    focusSkillId: row.focusSkillId,
  };
}
