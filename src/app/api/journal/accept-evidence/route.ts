import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { acceptClassification } from "@/lib/journal";

export const dynamic = "force-dynamic";

const AcceptSchema = z.object({
  reflectionId: z.string().min(1),
  skillId: z.string().min(1),
});

/**
 * POST /api/journal/accept-evidence — chấp nhận gợi ý phân loại ⇒ tạo Evidence.
 *
 * ⚠️ P3 — tiến độ là bằng chứng: dùng `recordEvidence` để level tính lại đúng.
 * ⚠️ Idempotent — bấm 2 lần không tạo trùng Evidence.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "reflectionId hoặc skillId không hợp lệ"));
  }

  try {
    const result = await acceptClassification(parsed.data);
    return toResponse(ok(result));
  } catch (error) {
    if (error instanceof Error && error.message === "journal_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy mục nhật ký"));
    }
    if (error instanceof Error && error.message === "skill_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
    }
    if (error instanceof Error && error.message === "journal_not_committed") {
      return toResponse(fail("conflict", "Chưa commit nhật ký — không tạo bằng chứng"));
    }
    throw error;
  }
}
