import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getUserProfile, saveUserProfile } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ProfileSchema = z
  .object({
    name: z.string().max(80).nullable().optional(),
    goals: z.string().max(2000).nullable().optional(),
    aiTone: z.enum(["direct", "coach", "gentle"]).optional(),
    learningLangs: z.array(z.enum(["en", "zh", "vi"])).min(1).optional(),
    zhLevel: z.string().max(20).optional(),
    enLevel: z.string().max(20).optional(),
    viLevel: z.string().max(20).optional(),
    languageStandard: z.enum(["cefr", "hsk", "both"]).optional(),
    interviewLang: z.enum(["en", "zh", "vi"]).optional(),
    monthlyBudgetUsd: z.number().min(0).max(10_000).optional(),
    saverMode: z.boolean().optional(),
  })
  .refine(
    // ⚠️ Task 35.6 — không được tắt hết `en`.
    //
    // Lý do: `en` là ngôn ngữ dùng chung cho cả kế hoạch AI, giao tiếp và
    // phỏng vấn. Tắt nó đi thì app mất hẳn nhánh chính mà không có cảnh báo.
    (data) =>
      data.learningLangs === undefined ||
      data.learningLangs.length === 0 ||
      data.learningLangs.includes("en"),
    {
      message: "Không thể tắt tiếng Anh — đây là ngôn ngữ dùng chung của app",
      path: ["learningLangs"],
    },
  );

/**
 * GET /api/settings/profile — đọc hồ sơ (FR-SC-01..07).
 */
export async function GET(): Promise<Response> {
  const profile = await getUserProfile();
  return toResponse(ok(profile));
}

/**
 * POST /api/settings/profile — lưu hồ sơ (FR-SC-01..07).
 *
 * ⚠️ FR-SC-04 — phải còn ≥ 1 ngôn ngữ đang học.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  try {
    const profile = await saveUserProfile(parsed.data);
    return toResponse(ok(profile));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "no_learning_lang") {
        return toResponse(fail("invalid_input", "Phải còn ít nhất 1 ngôn ngữ đang học"));
      }
      if (error.message === "name_too_long") {
        return toResponse(fail("invalid_input", "Tên tối đa 80 ký tự"));
      }
      if (error.message === "goals_too_long") {
        return toResponse(fail("invalid_input", "Mục tiêu tối đa 2000 ký tự"));
      }
      if (error.message === "invalid_budget") {
        return toResponse(fail("invalid_input", "Ngân sách không hợp lệ"));
      }
    }
    throw error;
  }
}
