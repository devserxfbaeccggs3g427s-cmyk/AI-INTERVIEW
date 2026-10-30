/**
 * `POST /api/skills/focus` — đặt / bỏ "Trọng tâm hôm nay" cho một node cây kỹ năng.
 *
 * FR-SK-01 / requirements.md §2.7: trọng tâm là **duy nhất 1 node/ngày**,
 * lưu theo NGÀY (model `FocusTarget`) chứ không lưu trên `Skill`.
 *
 * S01 đọc trọng tâm qua `getFocusSkill()` (src/lib/focus.ts) → đặt ở đây là
 * S01 tự động đổi trọng tâm, không cần S01 gọi lại API.
 *
 * Xem tasks.md 7.2 · design.md §4.3.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { clearFocusTarget, getFocusSkillId, setFocusTarget } from "@/lib/focus";

export const dynamic = "force-dynamic";

const FocusBody = z.object({
  /** Id skill cần đặt làm trọng tâm. */
  skillId: z.string().min(1),
  /** true → bỏ trọng tâm hôm nay. */
  clear: z.boolean().default(false),
});

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  const parsed = FocusBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "skillId không hợp lệ." } },
      { status: 400 },
    );
  }

  const { skillId, clear } = parsed.data;

  try {
    if (clear) {
      await clearFocusTarget();
      return NextResponse.json({ ok: true, data: { skillId: null } });
    }

    // Skill phải tồn tại — tránh ghi FocusTarget trỏ tới id không có thật.
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true, name: true },
    });
    if (!skill) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: "Không tìm thấy kỹ năng này." } },
        { status: 404 },
      );
    }

    await setFocusTarget(skillId);
    const current = await getFocusSkillId();

    return NextResponse.json({
      ok: true,
      data: { skillId: current, name: skill.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không lưu được trọng tâm, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}
