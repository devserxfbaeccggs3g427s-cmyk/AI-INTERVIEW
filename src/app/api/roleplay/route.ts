import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import { listRoleplayScenarios } from "@/lib/speak";

export const dynamic = "force-dynamic";

const TurnSchema = z.object({
  /** Id tình huống (từ `/api/speak/prompts`). */
  scenarioId: z.string().min(1),
  /** Lượt thoại đã diễn ra. */
  history: z
    .array(
      z.object({
        role: z.enum(["ai", "user"]),
        text: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
  /** `turn` = AI hỏi tiếp · `evaluate` = chấm mục tiêu ẩn. */
  action: z.enum(["turn", "evaluate"]).default("turn"),
  /** Câu người dùng vừa nói (cho `turn`). */
  userText: z.string().max(4000).optional(),
});

/**
 * Schema chấm mục tiêu ẩn (AC-CM-7) — mức độ đạt 0–5 + bằng chứng trích dẫn.
 */
const EvaluateSchema = z.object({
  /** Mức độ đạt mục tiêu 0–5. */
  goalScore: z.number().min(0).max(5),
  /** Bằng chứng trích dẫn từ lời người học (AC-CM-7). */
  evidence: z.array(z.string().max(500)).max(5).default([]),
  /** Nhận xét ngắn. */
  feedback: z.string().max(1500),
  /** Có đạt mục tiêu không (>= 3/5). */
  achieved: z.boolean(),
});

const ROLEPLAY_TURN_SYSTEM = `
Bạn là đối tác hội thoại trong tình huống tiếng Anh/Trung.
- Trả lời **đúng ngôn ngữ của tình huống**.
- Chỉ ra 1 lượt nói tiếp (1–3 câu), không giải thích, không chấm điểm.
- Đóng vai đối tác thật: hỏi lại, phản hồi, đẩy người học đi tiếp.
`.trim();

const ROLEPLAY_EVALUATE_SYSTEM = `
Bạn chấm mức độ đạt mục tiêu ẩn của người học sau cuộc hội thoại.

Trả về:
- goalScore: 0–5 (0 = không đạt, 3 = đạt phần lớn, 5 = đạt trọn vẹn).
- evidence: tối đa 5 câu TRÍCH DẪN nguyên văn từ lời người học làm bằng chứng.
- feedback: nhận xét ngắn bằng tiếng Việt.
- achieved: true khi goalScore >= 3.

KHÔNG bịa bằng chứng — chỉ trích dẫn câu có thật trong lời người học.
`.trim();

/**
 * POST /api/roleplay — hội thoại AI có mục tiêu ẩn (AC-CM-7, AC-CM-8).
 *
 * ⚠️ AC-CM-7 — mục tiêu ẩn chỉ dùng khi **chấm**, không lộ ra cho người học
 * trong lúc hội thoại.
 * ⚠️ AC-CM-8 — AI trả lời đúng ngôn ngữ của đề.
 * ⚠️ AC-CM-11 — không có key ⇒ nói rõ, KHÔNG giả lập.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = TurnSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ"));
  }

  const input = parsed.data;

  // Tìm tình huống.
  const scenarios = await listRoleplayScenarios();
  const scenario = scenarios.find((s) => s.id === input.scenarioId);
  if (!scenario) {
    return toResponse(fail("not_found", "Không tìm thấy tình huống"));
  }

  // ⚠️ AC-CM-11 — không có key ⇒ KHÔNG giả lập hội thoại.
  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Chưa có API key — không thể hội thoại với AI"),
    );
  }

  try {
    if (input.action === "evaluate") {
      // ⚠️ Chấm mục tiêu ẩn — chỉ ở bước kết thúc.
      const messages: Anthropic.MessageParam[] = [
        {
          role: "user",
          content: [
            `Tình huống: ${scenario.title}`,
            `Mục tiêu ẩn: ${scenario.hiddenGoal}`,
            "",
            "Lời thoại:",
            ...input.history.map(
              (turn) => `${turn.role === "ai" ? "Đối tác" : "Người học"}: ${turn.text}`,
            ),
          ].join("\n"),
        },
      ];

      const result = await callAIJson("AI-13", EvaluateSchema, {
        system: [
          {
            type: "text",
            text: ROLEPLAY_EVALUATE_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      });

      return toResponse(
        ok({
          goalScore: result.data.goalScore,
          evidence: result.data.evidence,
          feedback: result.data.feedback,
          achieved: result.data.achieved,
          source: "ai" as const,
        }),
      );
    }

    // Lượt hội thoại tiếp theo.
    const messages: Anthropic.MessageParam[] = [
      ...input.history.map(
        (turn): Anthropic.MessageParam => ({
          role: turn.role === "ai" ? "assistant" : "user",
          content: turn.text,
        }),
      ),
      ...(input.userText
        ? [
            {
              role: "user" as const,
              content: input.userText,
            },
          ]
        : []),
    ];

    const result = await callAIJson(
      "AI-13",
      z.object({ reply: z.string().min(1).max(2000) }),
      {
        system: [
          {
            type: "text",
            text: `${ROLEPLAY_TURN_SYSTEM}\n\nNgôn ngữ của tình huống: ${scenario.lang ?? "en"}\nTình huống: ${scenario.title}\n${scenario.brief}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      },
    );

    return toResponse(
      ok({
        reply: result.data.reply,
        // ⚠️ Mục tiêu ẩn KHÔNG gửi về client trong lúc hội thoại.
        source: "ai" as const,
      }),
    );
  } catch (error) {
    const aiError = toAiError(error);
    return toResponse(fail("ai_error", aiError.userMessage));
  }
}
