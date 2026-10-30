/**
 * `POST /api/journal/feedback` — AI-05 phản hồi nhật ký (tasks.md 12.3 · S06).
 *
 * Hợp đồng:
 *   Request : `{ content: string }`
 *   Response: `{ ok: true, data: { summary: string, sharpQuestion: string }, meta: AiCallMeta }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * Ràng buộc quan trọng (design.md §4.6 · requirements.md 4.5):
 *   - AI trả về **đúng 2 field**: 1 câu tóm tắt + 1 câu hỏi sắc.
 *   - **Tuyệt đối không trả lời dài.** Prompt yêu cầu, nhưng ta còn validate
 *     ở server: cắt còn 1 câu đầu rồi giới hạn theo `JOURNAL_MAX_*_CHARS`.
 *     Người dùng không bao giờ thấy lời giảng dài.
 *
 * Task `journal_feedback` chạy provider **anthropic** (`claude-opus-5`) theo
 * bảng định tuyến design.md §6.1. Router tự fallback `anthropic → local` và
 * tự ghi dòng `AiCall`.
 *
 * ⚠️ Privacy (FR-PS-07): route này **chỉ** chạy khi người dùng bấm nút
 * "Gửi AI phản hồi" — không có request tự động nào (task 12.7).
 *
 * Xem tasks.md 12.3 · design.md §4.6 / §6.1 / §6.6 / §7.2.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAi } from "@/lib/ai/router";
import {
  JOURNAL_MAX_LENGTH,
  JOURNAL_MAX_QUESTION_CHARS,
  JOURNAL_MAX_SUMMARY_CHARS,
  clampToSingleSentence,
} from "@/lib/journal";
import { SYSTEM_PROMPT_V1 } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  /** Nội dung nhật ký người dùng **chủ động gửi**. */
  content: z.string().trim().min(1).max(JOURNAL_MAX_LENGTH),
});

/**
 * Schema structured output của AI-05.
 *
 * `.strict()` để chặn field thừa — AI không được tự thêm "lời khuyên",
 * "điểm mạnh", "kế hoạch ngày mai"… (đó là dạng dài, vi phạm yêu cầu "tuyệt đối
 * không trả lời dài").
 */
const FeedbackSchema = z
  .object({
    /** Tóm tắt cốt lõi — 1 câu. */
    summary: z.string().min(1),
    /** Câu hỏi sắc bén để tự chất vấn — 1 câu. */
    sharpQuestion: z.string().min(1),
  })
  .strict();

type FeedbackPayload = z.infer<typeof FeedbackSchema>;

/**
 * System prompt — **phải tĩnh** để prefix cache của Anthropic hit
 * (FR-AI-09 · design.md §6.5). Không có timestamp, không UUID.
 */
const SYSTEM_PROMPT = [
  SYSTEM_PROMPT_V1,
  "",
  "Nhiệm vụ lần này — phản hồi nhật ký (AI-05):",
  "Trả về ĐÚNG 2 field: `summary` và `sharpQuestion`.",
  "`summary`: TÓM TẮT CỐT LÕI nội dung người dùng — ĐÚNG 1 CÂU.",
  "`sharpQuestion`: 1 CÂU HỎI SẮC bén buộc người dùng tự chất vấn về điều họ vừa viết.",
  "TUYỆT ĐỐI KHÔNG trả lời dài. KHÔNG thêm lời khuyên, không kể chuyện, không đưa kế hoạch,",
  "không liệt kê nhiều ý. Mỗi field tối đa 1 câu, tối đa 240 ký tự.",
  "Không chẩn đoán tâm lý, không đưa lời khuyên y tế.",
].join("\n");

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text.length > 0) raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: "Nội dung nhật ký không hợp lệ hoặc quá dài.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const envelope = await callAi<FeedbackPayload>("journal_feedback", {
    system: SYSTEM_PROMPT,
    user: [
      "Nội dung nhật ký của tôi:",
      '"""',
      parsed.data.content,
      '"""',
      "",
      "Trả về đúng 2 field: `summary` (1 câu) và `sharpQuestion` (1 câu).",
    ].join("\n"),
    schema: FeedbackSchema,
    effort: "low",
  });

  if (!envelope.ok) {
    return NextResponse.json(
      { ok: false, error: { code: envelope.error.code, message: envelope.error.message } },
      { status: 502 },
    );
  }

  // Chốt "tuyệt đối không trả lời dài" ở tầng server: cắt còn 1 câu + giới hạn
  // độ dài, dù model có trả về bao nhiêu.
  const summary = clampToSingleSentence(
    envelope.data.summary,
    JOURNAL_MAX_SUMMARY_CHARS,
  );
  const sharpQuestion = clampToSingleSentence(
    envelope.data.sharpQuestion,
    JOURNAL_MAX_QUESTION_CHARS,
  );

  if (!summary || !sharpQuestion) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "schema",
          message: "AI trả về phản hồi rỗng — thử viết thêm chút rồi gửi lại.",
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: { summary, sharpQuestion },
    meta: envelope.meta,
  });
}
