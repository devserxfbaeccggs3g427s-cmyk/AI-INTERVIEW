/**
 * `POST /api/test/level` — AI-16 ước lượng trình độ CEFR + cập nhật UserProfile (S21).
 *
 * Hợp đồng:
 *   Request : `{ lang: "zh"|"en", text: string }`
 *   Response: `{ ok: true, data: { level: "A1".."C2", explanation: string, provider: string, model: string, limitationNote: string } }`
 *            | `{ ok: false, error: { code, message } }`
 *
 * - Provider: `local qwen2.5-coder:7b-instruct` (task 14.13).
 * - Cập nhật `UserProfile.zhLevel` / `UserProfile.enLevel` (task 14.14).
 * - Ghi chú giới hạn provider local (design.md §6.9).
 * - `callAi` không throw → trả về fallback level khi offline.
 *
 * Xem tasks.md 14.13 / 14.14 · design.md §4.22 / §6.1.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { callAi } from "@/lib/ai/router";
import { SYSTEM_PROMPT_V1, TASK_PROMPT_LANGUAGE_LEVEL } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
  text: z.string().min(1),
});

// Schema cho AI estimate level — CEFR A1..C2
const LevelSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  explanation: z.string().min(1),
});

export type LevelOutput = z.infer<typeof LevelSchema>;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }

    const { lang, text } = parsed.data;

    // Gọi AI local qwen2.5-coder:7b-instruct để ước lượng trình độ
    const result = await callAi<LevelOutput>("language_level", {
      system: SYSTEM_PROMPT_V1 + "\n\n" + (Array.isArray(TASK_PROMPT_LANGUAGE_LEVEL) ? TASK_PROMPT_LANGUAGE_LEVEL.join("\n") : TASK_PROMPT_LANGUAGE_LEVEL),
      user: `Ngôn ngữ: ${lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}\nNội dung cần đánh giá:\n${text}`,
      schema: LevelSchema,
      effort: "low",
    });

    let level = "A1";
    let explanation = "Không thể ước lượng — đang ở chế độ offline.";
    let provider = "local";
    let model = "rule-cục-bộ";
    const limitationNote = "Ước lượng từ qwen2.5-coder:7b-instruct — có thể chưa chính xác cho trình độ cao.";

    if (result.ok) {
      level = result.data.level;
      explanation = result.data.explanation;
      provider = result.meta.provider;
      model = result.meta.model;
    } else {
      // Fallback: level A1 (mặc định zero → A1)
      level = "A1";
      explanation = "AI offline — mặc định A1.";
    }

    // Cập nhật UserProfile
    const updateField = lang === "zh" ? "zhLevel" : "enLevel";
    await prisma.userProfile.updateMany({
      where: {},
      data: { [updateField]: level },
    });

    return NextResponse.json({
      ok: true,
      data: {
        level,
        explanation,
        provider,
        model,
        limitationNote,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("[api/test/level]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể ước lượng trình độ" } },
      { status: 500 },
    );
  }
}