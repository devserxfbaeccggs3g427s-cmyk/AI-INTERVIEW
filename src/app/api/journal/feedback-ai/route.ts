import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  reflectionId: z.string().min(1),
  /**
   * ⚠️ FR-PSJ-03 — người dùng phải **chủ động đồng ý** mới cho phép gửi
   * nội dung nhật ký ra khỏi máy. Thiếu `consent` ⇒ `401`.
   */
  consent: z.literal(true),
});

/**
 * Schema phản hồi AI-05 — tóm tắt 1 câu + **1 câu hỏi sắc** (FR-PS-03).
 */
const FeedbackSchema = z.object({
  summary: z.string().min(1).max(300),
  sharpQuestion: z.string().min(1).max(300),
});

const JOURNAL_FEEDBACK_SYSTEM = `
Bạn đọc nhật ký cá nhân của người dùng và phản hồi ngắn gọn.

Trả về đúng 2 trường:
- summary: tóm tắt 1 câu (tối đa 300 ký tự) — điều người dùng đang trải nghiệm.
- sharpQuestion: đúng 1 câu hỏi sắc (tối đa 300 ký tự) — câu hỏi đẩy sâu vào
  trải nghiệm, KHÔNG phải lời khuyên chung chung.

Không viết lời khuyên dài, không liệt kê, không chào hỏi.
`.trim();

/** Cắt preview ≤160 ký tự — C13. */
function buildPreview(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * POST /api/journal/feedback-ai — lấy phản hồi AI cho nhật ký (AI-05).
 *
 * ⚠️ FR-PSJ-03 — đây là hành động **duy nhất** đưa nội dung nhật ký ra khỏi
 * máy. Mỗi lần gọi ghi 1 dòng `AiCall` kèm `dataPreview` + `sourceId`.
 *
 * ⚠️ FR-PSJ-05 — không có API key ⇒ trả lỗi rõ ràng, KHÔNG giả lập phản hồi.
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
    // ⚠️ Thiếu consent ⇒ 401 (không gọi SDK).
    const hasConsent = (body as { consent?: unknown })?.consent === true;
    if (!hasConsent) {
      return toResponse(
        fail("consent_required", "Cần xác nhận đồng ý trước khi gửi nhật ký lên AI"),
      );
    }
    return toResponse(fail("invalid_input", "reflectionId không hợp lệ"));
  }

  // ⚠️ Không có key ⇒ nói rõ, KHÔNG trả phản hồi giả.
  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Chưa có API key — không thể lấy phản hồi AI"),
    );
  }

  const reflection = await prisma.reflection.findUnique({
    where: { id: parsed.data.reflectionId },
    select: { id: true, answer: true, prompt: true, classifiedDomain: true },
  });

  if (!reflection) {
    return toResponse(fail("not_found", "Không tìm thấy mục nhật ký"));
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          "Nội dung nhật ký:",
          reflection.answer,
          "",
          `Ngữ cảnh: ${reflection.classifiedDomain ?? "cá_nhân"}`,
        ].join("\n"),
      },
    ];

    const result = await callAIJson("AI-05", FeedbackSchema, {
      system: [
        {
          type: "text",
          text: JOURNAL_FEEDBACK_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    // ⚠️ Ghi log minh bạch — nội dung đã gửi lên (C13, C11).
    await prisma.aiCall.create({
      data: {
        feature: "journal_feedback",
        model: "claude-opus-5",
        dataPreview: buildPreview(reflection.answer),
        sourceId: reflection.id,
        dataKinds: JSON.stringify(["journal"]),
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        cacheRead: result.usage?.cacheRead ?? 0,
        estimatedCost: 0,
        ok: true,
      },
    });

    return toResponse(
      ok({
        summary: result.data.summary,
        question: result.data.sharpQuestion,
      }),
    );
  } catch (error) {
    const aiError = toAiError(error);
    return toResponse(fail("ai_error", aiError.userMessage));
  }
}
