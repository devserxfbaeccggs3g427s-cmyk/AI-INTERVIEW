import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import { AUTOFILL_INSTRUCTION, AutofillSchema } from "@/lib/prompts";
import { classifyLocally } from "@/lib/log-classify";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  text: z.string().min(3).max(160),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  language: z.enum(["en", "zh", "vi"]).nullable().optional(),
});

/**
 * POST /api/log/autofill — AI-02 + fallback rule (FR-QL-04, FR-QL-13).
 *
 * ⚠️ AI-02 dùng `claude-haiku-4-5`, effort `low`, **không streaming**.
 * ⚠️ Không có API key ⇒ chạy rule cục bộ (`src/lib/log-classify.ts`) và
 * badge nguồn đổi từ "AI" sang "rule".
 *
 * ⚠️ Mọi dữ liệu biến động (mô tả + danh sách kỹ năng) nằm trong `messages`
 * ⇒ `system` giữ nguyên prefix cache.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const { text, domain, language } = parsed.data;

  // ── Offline: rule cục bộ (P5) ──────────────────────────────────────────
  if (!isAiAvailable()) {
    const local = await classifyLocally({ text, domain, language });
    return toResponse(ok({ ...local, source: "rule" as const }));
  }

  try {
    // Danh sách kỹ năng hợp lệ — biến động ⇒ nằm trong `messages`.
    const skills = await prisma.skill.findMany({
      where: { domain },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          `Mô tả hoạt động: ${text}`,
          "",
          "Danh sách kỹ năng hợp lệ (chỉ được chọn id có trong danh sách):",
          skills.length > 0
            ? skills.map((s) => `- ${s.id} — ${s.name}`).join("\n")
            : "(không có kỹ năng nào)",
        ].join("\n"),
      },
    ];

    const result = await callAIJson("AI-02", AutofillSchema, {
      system: [
        {
          type: "text",
          text: AUTOFILL_INSTRUCTION,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    // Chỉ nhận `skillId` có thật trong danh sách được cấp.
    const validIds = new Set(skills.map((s) => s.id));
    const skillId =
      result.data.skillId && validIds.has(result.data.skillId)
        ? result.data.skillId
        : null;

    const skill = skillId ? skills.find((s) => s.id === skillId) : null;

    return toResponse(
      ok({
        domain: result.data.domain,
        skillId,
        skillName: skill?.name ?? null,
        minutes: result.data.minutes,
        difficulty: result.data.difficulty,
        language: result.data.language,
        source: "ai" as const,
      }),
    );
  } catch (error) {
    // AI lỗi ⇒ fallback rule (không để trang trắng).
    const aiError = toAiError(error);
    const local = await classifyLocally({ text, domain, language });

    return toResponse(
      ok({ ...local, source: "rule" as const, warning: aiError.userMessage }),
    );
  }
}
