import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { setFocusSkill } from "@/lib/skills";

export const dynamic = "force-dynamic";

const FocusSchema = z.object({ skillId: z.string().min(1) });

/**
 * POST /api/skills/focus — đặt trọng tâm hôm nay (FR-SK-08).
 *
 * Chỉ một kỹ năng là trọng tâm tại một thời điểm.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = FocusSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "skillId không hợp lệ"));
  }

  try {
    await setFocusSkill(parsed.data.skillId);
    return toResponse(ok({ focusSkillId: parsed.data.skillId }));
  } catch (error) {
    if (error instanceof Error && error.message === "skill_not_found") {
      return toResponse(fail("not_found", "Không tìm thấy kỹ năng"));
    }
    throw error;
  }
}
