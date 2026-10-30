/**
 * `POST /api/grade` — AI-03/04 chấm giao tiếp (viết S07, nói S08) theo rubric 5 tiêu chí.
 *
 * Hợp đồng:
 *   Request : `{ mode: "write" | "talk", prompt: string, content: string, language?: "vi" | "en" | "zh" }`
 *   Response: `{ ok: true, data: { scores: Record<string,number>, total: number, comments: Record<string,string>, suggestions: string[], meta: AiCallMeta } }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * - `mode="write"` → AI-03 (S07): chấm bài viết
 * - `mode="talk"` → AI-04 (S08): chấm bài nói (có transcript từ Web Speech API)
 * - `language` dùng để điều chỉnh ngữ cảnh chấm (vi/en/zh)
 * - Structured output theo `RUBRIC_COMMUNICATION` (5 tiêu chí, mỗi tiêu chí 0–5)
 * - Router tự fallback: anthropic → local (nếu task cho phép) → rule cục bộ
 * - Không bao giờ trả lỗi trần cho UI (design.md §7.2)
 *
 * Xem tasks.md 11.3 / 18.3 · design.md §6.1 / §6.6 · FR-AI-03 / FR-AI-04.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAi } from "@/lib/ai/router";
import {
  GradingSchema,
  buildGradingResult,
  buildUserPrompt,
  computeTotal,
  type GradingOutput,
} from "@/lib/grading-schema";
import { SYSTEM_PROMPT_V1 } from "@/lib/prompts";
import { prisma } from "@/lib/db";
import { recomputeSkillLevel } from "@/lib/levels-server";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  mode: z.enum(["write", "talk"]),
  /** Đề bài / ngữ cảnh giao tiếp */
  prompt: z.string().min(1),
  /** Nội dung người dùng viết hoặc transcript nói */
  content: z.string().min(1),
  /** Ngôn ngữ: vi / en / zh — mặc định vi */
  language: z.enum(["vi", "en", "zh"]).default("vi"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RequestBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { mode, prompt, content, language } = parsed.data;

    // Gọi AI qua router (task "grading" — anthropic, claude-opus-5)
    const result = await callAi<GradingOutput>("grading", {
      system: SYSTEM_PROMPT_V1,
      user: buildUserPrompt(mode, prompt, content, language),
      schema: GradingSchema,
      effort: "medium",
    });

    if (!result.ok) {
      // Router đã log AiCall và fallback — trả về lỗi dạng chuẩn
      return NextResponse.json(
        { ok: false, error: { code: result.error.code, message: result.error.message } },
        { status: 502 }
      );
    }

    const total = computeTotal(result.data.scores);
    const grading = buildGradingResult(result.data);

    // Lưu Activity + Evidence (domain communication) — task 11.6.
    // 1 Activity (chấm điểm) + 1 Evidence (bằng chứng cho skill "Viết"/"Nói").
    // Evidence chỉ tạo khi tìm thấy skill tương ứng trong cây kỹ năng.
    let activityId: string | null = null;
    let evidenceId: string | null = null;
    let skillId: string | null = null;

    try {
      // Skill đích theo mode — "Viết" cho S07, "Nói" cho S08.
      const targetSkillName = mode === "write" ? "Viết" : "Nói";
      const skill = await prisma.skill.findFirst({
        where: { name: targetSkillName },
        select: { id: true },
      });
      skillId = skill?.id ?? null;

      const activity = await prisma.activity.create({
        data: {
          skillId,
          domain: "communication",
          type: mode === "write" ? "write" : "speak",
          title: prompt,
          content,
          minutes: Math.ceil(content.length / 200), // ước lượng ~200 ký tự/phút
          aiScore: total,
        },
      });
      activityId = activity.id;

      // Evidence rating 1..4 — quy đổi từ điểm trung bình 0..5.
      // Chỉ rating >= 3 mới làm tăng level của skill (FR-SK-03).
      if (skillId) {
        const rating = Math.max(1, Math.min(4, Math.round(total)));
        const evidence = await prisma.evidence.create({
          data: { activityId: activity.id, skillId, rating },
        });
        evidenceId = evidence.id;
        await recomputeSkillLevel(skillId);
      }
    } catch {
      // Không block UI nếu DB lỗi — AI đã trả kết quả
      console.warn("Failed to create Activity for grading");
    }

    return NextResponse.json({
      ok: true,
      data: {
        scores: grading.scores,
        total: grading.total,
        comments: grading.comments,
        suggestions: grading.suggestions,
        activityId,
        evidenceId,
        skillId,
        meta: {
          provider: result.meta.provider,
          model: result.meta.model,
          effort: result.meta.effort,
          inputTokens: result.meta.inputTokens,
          outputTokens: result.meta.outputTokens,
          cacheRead: result.meta.cacheRead,
          cacheWrite: result.meta.cacheWrite,
          estimatedCost: result.meta.estimatedCost,
          latencyMs: result.meta.latencyMs,
          fallbackFrom: result.meta.fallbackFrom,
        },
      },
    });
  } catch (e) {
    console.error("[api/grade] unexpected error:", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Lỗi không mong muốn" } },
      { status: 500 }
    );
  }
}