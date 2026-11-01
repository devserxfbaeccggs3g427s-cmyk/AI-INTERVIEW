import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { fail, ok, toResponse } from "@/lib/api-response";
import { callAIJson, isAiAvailable, toAiError } from "@/lib/anthropic";
import {
  averageRubric,
  gradeLocally,
  normalizeErrorGroups,
  normalizeRubric,
  RUBRIC_CRITERIA,
  type RubricScores,
} from "@/lib/speak";

export const dynamic = "force-dynamic";

const GradeRequestSchema = z.object({
  /** Nội dung người dùng viết/nói. */
  text: z.string().min(1).max(10_000),
  /** Ngôn ngữ của bài (đề đưa cho AI). */
  lang: z.string().max(10).default("en"),
  /** Chế độ: `speak` (nói) | `write` (viết). */
  mode: z.enum(["speak", "write"]).default("write"),
  /** Đề bài (context cho AI). */
  prompt: z.string().max(2000).optional(),
  /** Ngữ cảnh ẩn (roleplay) — AI dùng để chấm mục tiêu. */
  hiddenGoal: z.string().max(1000).optional(),
  /** Cho phép fallback cục bộ khi không có API key. */
  allowLocalFallback: z.boolean().default(true),
});

/**
 * Schema chấm điểm — **đúng 5 tiêu chí** (AC-CM-1).
 */
const AiGradeSchema = z.object({
  rubric: z.object({
    clarity: z.number().min(0).max(5),
    structure: z.number().min(0).max(5),
    tone: z.number().min(0).max(5),
    naturalness: z.number().min(0).max(5),
    grammar: z.number().min(0).max(5),
  }),
  feedback: z.string().max(2000),
  errorGroups: z.object({
    grammar: z.array(z.string()).default([]),
    vocab: z.array(z.string()).default([]),
    expression: z.array(z.string()).default([]),
    context: z.array(z.string()).default([]),
  }),
  corrections: z.array(z.string()).max(10).default([]),
  /** Từ khoá nên sinh flashcard (AC-CM-9, AC-CM-10). */
  keywords: z
    .array(z.object({ front: z.string().max(200), back: z.string().max(500) }))
    .max(10)
    .default([]),
});

const GRADE_SYSTEM = `
Bạn chấm điểm bài luyện nói/viết của người học ngôn ngữ.

Trả về:
- rubric: đúng 5 tiêu chí, mỗi tiêu chí 0–5 (có thể dùng số thập phân):
  clarity (rõ ràng), structure (cấu trúc), tone (giọng văn),
  naturalness (tự nhiên), grammar (ngữ pháp).
- feedback: nhận xét ngắn gọn, cụ thể, bằng tiếng Việt.
- errorGroups: 4 nhóm lỗi — grammar, vocab, expression, context. Mỗi nhóm là
  mảng các lỗi cụ thể (có thể rỗng nếu không có lỗi).
- corrections: tối đa 5 câu sửa gợi ý, mỗi câu là "sai → đúng".
- keywords: tối đa 10 cặp từ vựng đáng nhớ từ bài, để sinh flashcard.

Không chấm theo cảm tính — dẫn chiếu lỗi cụ thể trong bài.
`.trim();

/**
 * POST /api/grade — chấm điểm bài luyện theo rubric (AC-CM-1..4, AC-CM-11).
 *
 * ⚠️ AC-CM-1 — rubric có **đúng 5 tiêu chí**.
 * ⚠️ AC-CM-2 — tổng điểm = trung bình 5 tiêu chí (tính ở server, không
 * tin điểm AI tự khai).
 * ⚠️ AC-CM-11 — không có API key ⇒ trả lỗi rõ ràng; chỉ khi client cho
 * phép `allowLocalFallback` mới dùng rule cục bộ với `source: "local"`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = GradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const input = parsed.data;

  // ⚠️ AC-CM-11 — không có key ⇒ KHÔNG giả lập phản hồi AI.
  if (!isAiAvailable()) {
    if (!input.allowLocalFallback) {
      return toResponse(
        fail("no_api_key", "Chưa có API key — không thể chấm điểm bằng AI"),
      );
    }

    const local = gradeLocally(input.text);

    return toResponse(
      ok({
        score: local.score,
        rubric: local.rubric,
        feedback: local.feedback,
        errorGroups: local.errorGroups,
        corrections: local.corrections,
        keywords: [],
        // ⚠️ Nguồn = local ⇒ UI không được ghi "AI".
        source: "local" as const,
      }),
    );
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          input.prompt ? `Đề bài: ${input.prompt}` : "",
          input.hiddenGoal ? `Mục tiêu ẩn: ${input.hiddenGoal}` : "",
          `Ngôn ngữ: ${input.lang}`,
          `Chế độ: ${input.mode === "speak" ? "nói" : "viết"}`,
          "",
          "Bài của người học:",
          input.text,
        ]
          .filter((line) => line.length > 0)
          .join("\n"),
      },
    ];

    const result = await callAIJson("AI-09", AiGradeSchema, {
      system: [
        {
          type: "text",
          text: GRADE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    // ⚠️ Chuẩn hoá lại — không tin điểm AI tự khai.
    const rubric: RubricScores = normalizeRubric(result.data.rubric);

    return toResponse(
      ok({
        // ⚠️ AC-CM-2 — tổng = trung bình 5 tiêu chí (server tính).
        score: averageRubric(rubric),
        rubric,
        feedback: result.data.feedback,
        errorGroups: normalizeErrorGroups(result.data.errorGroups),
        corrections: result.data.corrections,
        keywords: result.data.keywords,
        source: "ai" as const,
      }),
    );
  } catch (error) {
    const aiError = toAiError(error);
    return toResponse(fail("ai_error", aiError.userMessage));
  }
}

/**
 * GET /api/grade — mô tả rubric cho UI (5 tiêu chí).
 */
export async function GET(): Promise<Response> {
  return toResponse(ok({ criteria: RUBRIC_CRITERIA }));
}
