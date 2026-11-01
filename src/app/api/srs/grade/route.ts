import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { gradeCard } from "@/lib/srs";

export const dynamic = "force-dynamic";

const GradeSchema = z.object({
  cardId: z.string().min(1),
  /** 1=Again · 2=Hard · 3=Good · 4=Easy */
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

/**
 * POST /api/srs/grade — chấm điểm 1 thẻ theo FSRS (AC-LG-1).
 *
 * ⚠️ Mọi tính toán đi qua `applyRating()` — đúng thuật toán FSRS.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = GradeSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "cardId hoặc rating không hợp lệ"));
  }

  try {
    const result = await gradeCard({
      cardId: parsed.data.cardId,
      rating: parsed.data.rating,
    });
    return toResponse(ok(result));
  } catch (error) {
    if (error instanceof Error && error.message === "card_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy thẻ"));
    }
    throw error;
  }
}
