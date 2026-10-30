/**
 * `POST /api/plan/tomorrow` — tạo 1 slot luyện tập cho **ngày mai**.
 *
 * Dùng bởi `AiSuggestionCard` (task 7.12): đề xuất bài tập từ lỗ hổng bằng chứng
 * → nút "Tạo slot ngày mai" → tạo `PlanItem` cho ngày mai.
 *
 * Quy tắc slot: slot = 0 (khối chuyên môn đầu ngày), domain = domain của
 * skill, `source = "manual"` (đây là hành động của người dùng, không phải AI).
 *
 * Xem tasks.md 7.12 · design.md §4.4.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { addDays, startOfDay } from "@/lib/dates";
import { DOMAINS } from "@/lib/types";

export const dynamic = "force-dynamic";

const TomorrowSlotBody = z.object({
  /** Id skill mà slot sẽ gắn vào. */
  skillId: z.string().min(1),
  /** Tiêu đề hành động. */
  action: z.string().trim().min(1).max(200),
  /** Mô tả chi tiết (tùy chọn). */
  detail: z.string().max(240).nullable().optional(),
  /** Thời lượng (phút). */
  minutes: z.number().int().min(1).max(120),
  /** Domain của skill. */
  domain: z.enum(DOMAINS),
  /** Slot đích trong ngày mai — mặc định 0. */
  slot: z.number().int().min(0).max(5).default(0),
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

  const parsed = TomorrowSlotBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Dữ liệu slot không hợp lệ." } },
      { status: 400 },
    );
  }

  const { skillId, action, detail, minutes, domain, slot } = parsed.data;

  try {
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true },
    });
    if (!skill) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: "Không tìm thấy kỹ năng này." } },
        { status: 404 },
      );
    }

    const tomorrow = startOfDay(addDays(new Date(), 1));

    // Slot đã tồn tại trong ngày mai → cập nhật thay vì tạo trùng.
    const existing = await prisma.planItem.findFirst({
      where: { date: tomorrow, slot },
    });

    const data = {
      date: tomorrow,
      slot,
      domain,
      action,
      detail: detail ?? null,
      minutes,
      skillId,
      done: false,
      source: "manual",
    };

    const item = existing
      ? await prisma.planItem.update({ where: { id: existing.id }, data })
      : await prisma.planItem.create({ data });

    return NextResponse.json({
      ok: true,
      data: {
        id: item.id,
        date: tomorrow.toISOString(),
        slot: item.slot,
        action: item.action,
        minutes: item.minutes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không tạo được slot ngày mai, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}
