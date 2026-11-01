import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getDelta, saveAttempt } from "@/lib/speak";

export const dynamic = "force-dynamic";

const CommitSchema = z.object({
  promptId: z.string().nullable().optional(),
  text: z.string().min(1).max(10_000),
  lang: z.string().max(10).optional(),
  mode: z.enum(["speak", "write"]).optional(),
  skillId: z.string().nullable().optional(),
  /** Điểm chấm sẵn (nếu đã chấm ở bước trước). */
  score: z.number().min(0).max(5).nullable().optional(),
  rubric: z
    .object({
      accuracy: z.number(),
      fluency: z.number(),
      vocabulary: z.number(),
      grammar: z.number(),
      coherence: z.number(),
    })
    .nullable()
    .optional(),
  feedback: z.string().max(2000).nullable().optional(),
});

/**
 * POST /api/speak/commit — lưu lượt luyện (AC-CM-5).
 *
 * ⚠️ AC-CM-5 — mọi bài luyện tạo `Evidence` (khi có skillId) ⇒ tiến độ là
 * bằng chứng (P3).
 * ⚠️ AC-CM-3 — trả delta so với lần trước.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = CommitSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const mode = parsed.data.mode ?? "write";

  const grade =
    parsed.data.score !== null && parsed.data.score !== undefined && parsed.data.rubric
      ? {
          score: parsed.data.score,
          rubric: parsed.data.rubric,
          feedback: parsed.data.feedback ?? "",
          errorGroups: { grammar: [], vocab: [], expression: [], context: [] },
          corrections: [],
          source: "ai" as const,
        }
      : null;

  try {
    const attempt = await saveAttempt({
      promptId: parsed.data.promptId ?? null,
      text: parsed.data.text,
      ...(parsed.data.lang ? { lang: parsed.data.lang } : {}),
      mode,
      skillId: parsed.data.skillId ?? null,
      grade,
    });

    // ⚠️ AC-CM-3 — delta so với lần trước (null nếu chưa có lần trước).
    const delta =
      attempt.score !== null ? await getDelta(mode, attempt.score) : null;

    return toResponse(ok({ attempt, delta }));
  } catch (error) {
    if (error instanceof Error && error.message === "empty_attempt") {
      return toResponse(fail("invalid_input", "Nội dung không được rỗng"));
    }
    throw error;
  }
}
