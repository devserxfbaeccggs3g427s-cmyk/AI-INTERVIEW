import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { classifyJournalLocal } from "@/lib/journal";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ reflectionId: z.string().min(1) });

/**
 * POST /api/journal/classify — phân loại nhật ký bằng **rule cục bộ** (RB-03).
 *
 * ⚠️ Không gọi AI — luôn `source: "local"`. UI **không** được ghi "AI".
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
    return toResponse(fail("invalid_input", "reflectionId không hợp lệ"));
  }

  try {
    const entry = await classifyJournalLocal(parsed.data.reflectionId);
    return toResponse(
      ok({
        domain: entry.domain,
        skillId: entry.skillId,
        confidence: entry.confidence,
        source: entry.source,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "journal_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục nhật ký"));
    }
    throw error;
  }
}
