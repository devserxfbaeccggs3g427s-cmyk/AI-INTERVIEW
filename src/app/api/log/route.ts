import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { writeLogWithDedupe } from "@/lib/log";

export const dynamic = "force-dynamic";

const LogDraftSchema = z.object({
  text: z.string().min(1).max(160),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  type: z
    .enum(["study", "write", "speak", "srs", "journal", "health", "custom"])
    .default("custom"),
  minutes: z.number().int().min(1).max(240).default(20),
  skillId: z.string().nullable().default(null),
  difficulty: z.number().int().min(1).max(4).nullable().default(null),
  note: z.string().max(500).nullable().optional(),
  language: z.enum(["en", "zh", "vi"]).nullable().optional(),
  createEvidence: z.boolean().default(false),
});

/**
 * POST /api/log — **đường ghi chính** (FR-QL-05, FR-QL-08, FR-QL-09, AC-2).
 *
 * ⚠️ KHÔNG chờ AI — ghi thẳng. Autofill là gợi ý, không phải điều kiện.
 * ⚠️ Dedup: 2 request trong 10 giây với cùng nội dung ⇒ chỉ tạo 1 Activity.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = LogDraftSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  try {
    const { entry, deduplicated } = await writeLogWithDedupe(parsed.data);
    return toResponse(ok({ entry, deduplicated }));
  } catch (error) {
    if (error instanceof Error && error.message === "empty_text") {
      return toResponse(fail("invalid_input", "Mô tả không được rỗng"));
    }
    throw error;
  }
}
