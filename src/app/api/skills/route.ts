/**
 * `POST /api/skills` — tạo mục kỹ năng mới (task 7.4).
 *
 * FR-SK-04: "Mỗi mục kỹ năng có thể mở rộng: tên, domain, mục cha, mức mục tiêu."
 * → tạo `Skill` với `parentId` (mục cha) + `targetLevel` (mức mục tiêu).
 *
 * `level` luôn khởi tạo bằng **0** — FR-SK-03: level CHỈ tăng khi đủ Evidence
 * rating >= 3, không bao giờ tăng do thao tác tạo node.
 *
 * Xem tasks.md 7.4 · design.md §4.3 · FR-SK-03 / FR-SK-04.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { MAX_LEVEL } from "@/lib/levels";
import { DOMAINS } from "@/lib/types";

export const dynamic = "force-dynamic";

const CreateSkillBody = z.object({
  /** Tên mục kỹ năng. */
  name: z.string().trim().min(1).max(120),
  /** Domain của node. */
  domain: z.enum(DOMAINS),
  /** Id mục cha — bỏ trống nếu tạo node tầng 2 (skill thuộc domain). */
  parentId: z.string().min(1).nullable().optional(),
  /** Mức mục tiêu 0..5. */
  targetLevel: z.number().int().min(0).max(MAX_LEVEL).default(3),
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

  const parsed = CreateSkillBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: "Thông tin mục kỹ năng không hợp lệ.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const { name, domain, parentId, targetLevel } = parsed.data;

  try {
    // Mục cha phải tồn tại — tránh cây bị "mồ côi".
    if (parentId) {
      const parent = await prisma.skill.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json(
          { ok: false, error: { code: "not_found", message: "Mục cha không tồn tại." } },
          { status: 404 },
        );
      }
    }

    // `position` = số node cùng tầng + 1 → cây giữ thứ tự ổn định khi thêm mới.
    const siblings = await prisma.skill.count({
      where: parentId ? { parentId } : { parentId: null, domain },
    });

    const skill = await prisma.skill.create({
      data: {
        name,
        domain,
        parentId: parentId ?? null,
        targetLevel,
        // FR-SK-03: level chỉ tăng qua Evidence → luôn khởi tạo bằng 0.
        level: 0,
        position: siblings,
      },
      select: { id: true, name: true, domain: true, parentId: true, level: true, targetLevel: true },
    });

    return NextResponse.json({ ok: true, data: skill });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không tạo được mục kỹ năng, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}
