/**
 * Tiện ích sinh & ghi kế hoạch 6 slot — dùng chung cho S02 (`/plan`) và S01.
 *
 * Tách riêng khỏi `lib/plan.ts` (file đó là hợp đồng cố định của agent nền tảng)
 * để không đụng vào file agent khác sở hữu.
 *
 * Xem tasks.md 6.2 / 6.4 · design.md §4.2 · FR-DL-06.
 */

import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import { SLOT_TEMPLATE, generateLocalPlan, type LocalPlanContext } from "@/lib/plan";
import type { Domain, PlanSlot } from "@/lib/types";

/** Ngữ cản đầu vào cho bộ sinh kế hoạch — dựng từ DB hiện tại. */
export async function buildLocalPlanContext(now: Date = new Date()): Promise<LocalPlanContext> {
  const day = startOfDay(now);
  const weekAgo = new Date(day.getTime());
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [skills, dueCards, weekItems] = await Promise.all([
    prisma.skill.findMany({
      select: { id: true, name: true, level: true, targetLevel: true, domain: true },
      orderBy: { position: "asc" },
    }),
    prisma.card.count({ where: { due: { lte: now } } }),
    prisma.planItem.findMany({
      where: { date: { gte: weekAgo, lt: day } },
      select: { done: true },
    }),
  ]);

  const total = weekItems.length;
  const done = weekItems.filter((i) => i.done).length;

  // Streak: đếm ngày liên tiếp có ít nhất 1 slot `done` tính từ hôm qua.
  const doneDays = await prisma.planItem.findMany({
    where: { done: true, date: { gte: weekAgo } },
    select: { date: true },
    distinct: ["date"],
  });
  const daySet = new Set(doneDays.map((d) => new Date(d.date).toDateString()));
  let streak = 0;
  const cursor = new Date(day.getTime());
  cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(cursor.toDateString()) && streak < 365) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    date: day,
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      targetLevel: s.targetLevel,
      domain: s.domain,
    })),
    dueCards,
    streak,
    lastWeekCompletion: total === 0 ? 0 : done / total,
  };
}

/** Sinh 6 slot bằng rule cục bộ (fallback khi không có AI). */
export async function generateFallbackPlan(now: Date = new Date()): Promise<PlanSlot[]> {
  const ctx = await buildLocalPlanContext(now);
  return generateLocalPlan(ctx);
}

/**
 * Ghi đè kế hoạch hôm nay — **giữ slot đã `done`**.
 *
 * FR-DL-06: "Lập lại kế hoạch hôm nay → AI sinh lại 6 hành động, giữ nguyên
 * hành động đã xong". Nên:
 *   - Slot cũ `done = true` → giữ nguyên nội dung, KHÔNG ghi đè.
 *   - Slot cũ `done = false` → cập nhật theo slot mới (nếu slot đó có nội dung mới).
 *   - Slot mới không có bản cũ → tạo mới.
 *   - Slot cũ không còn trong slot mới → xoá (chỉ xoá những slot chưa `done`).
 *
 * Trả về số slot đã ghi để toast báo "Đã ghi N slot".
 */
export async function applyPlanSlots(
  slots: PlanSlot[],
  options: { date?: Date; source?: "ai" | "fallback" | "manual" } = {},
): Promise<{ written: number; keptDone: number; removed: number }> {
  const day = startOfDay(options.date ?? new Date());
  const source = options.source ?? "ai";

  const existing = await prisma.planItem.findMany({ where: { date: day } });
  const existingBySlot = new Map(existing.map((p) => [p.slot, p]));

  let written = 0;
  let keptDone = 0;
  let removed = 0;

  for (const slot of slots) {
    const prev = existingBySlot.get(slot.slot);

    if (prev?.done) {
      // Slot đã hoàn thành → giữ nguyên, không đụng vào (FR-DL-06).
      keptDone += 1;
      continue;
    }

    const data = {
      date: day,
      slot: slot.slot,
      domain: slot.domain,
      action: slot.action,
      detail: slot.detail,
      minutes: slot.minutes,
      skillId: slot.skillId,
      done: false,
      source,
    };

    if (prev) {
      await prisma.planItem.update({ where: { id: prev.id }, data });
    } else {
      await prisma.planItem.create({ data });
    }
    written += 1;
  }

  // Xoá slot cũ không còn trong danh sách mới — chỉ xoá slot CHƯA xong.
  const newSlots = new Set(slots.map((s) => s.slot));
  const stale = existing.filter((p) => !newSlots.has(p.slot) && !p.done);
  if (stale.length > 0) {
    await prisma.planItem.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
    removed = stale.length;
  }

  return { written, keptDone, removed };
}

/**
 * Lưu 6 slot do người dùng chỉnh tay trên S02.
 *
 * Khác `applyPlanSlots`: ở đây slot có `action` **rỗng** nghĩa là người dùng
 * đã bấm "Xoá" → xoá hẳn `PlanItem` của slot đó (nếu chưa `done`).
 *
 * Cấu trúc 6 slot vẫn cố định (SPEC.md §2.1): slot bị xoá chỉ là "trống",
 * không làm lệch trục của các slot còn lại.
 */
export async function savePlanSlots(
  slots: PlanSlot[],
  options: { date?: Date; source?: "ai" | "fallback" | "manual" } = {},
): Promise<{ written: number; keptDone: number; removed: number }> {
  const day = startOfDay(options.date ?? new Date());
  const source = options.source ?? "manual";

  const existing = await prisma.planItem.findMany({ where: { date: day } });
  const existingBySlot = new Map(existing.map((p) => [p.slot, p]));

  let written = 0;
  let keptDone = 0;
  let removed = 0;

  for (const slot of slots) {
    const prev = existingBySlot.get(slot.slot);
    const isEmpty = slot.action.trim().length === 0;

    if (isEmpty) {
      // "Xoá" → gỡ slot khỏi kế hoạch. Slot đã hoàn thành thì giữ lại
      // (không được xoá công sức đã hoàn thành — FR-DL-06).
      if (prev && !prev.done) {
        await prisma.planItem.delete({ where: { id: prev.id } });
        removed += 1;
      } else if (prev?.done) {
        keptDone += 1;
      }
      continue;
    }

    if (prev?.done) {
      // Slot đã hoàn thành → giữ nguyên, không đụng vào (FR-DL-06).
      keptDone += 1;
      continue;
    }

    const data = {
      date: day,
      slot: slot.slot,
      domain: slot.domain,
      action: slot.action,
      detail: slot.detail,
      minutes: slot.minutes,
      skillId: slot.skillId,
      done: false,
      source,
    };

    if (prev) {
      await prisma.planItem.update({ where: { id: prev.id }, data });
    } else {
      await prisma.planItem.create({ data });
    }
    written += 1;
  }

  return { written, keptDone, removed };
}

/** Đọc 6 slot của một ngày — trả về `PlanSlot[]` đúng thứ tự 0..5. */
export async function readPlanSlots(date: Date = new Date()): Promise<PlanSlot[]> {
  const day = startOfDay(date);
  const items = await prisma.planItem.findMany({ where: { date: day }, orderBy: { slot: "asc" } });

  const bySlot = new Map(items.map((p) => [p.slot, p]));
  return SLOT_TEMPLATE.map((t) => {
    const got = bySlot.get(t.slot);
    return {
      slot: t.slot,
      domain: (got?.domain as Domain) ?? t.domain,
      action: got?.action ?? t.content,
      detail: got?.detail ?? null,
      minutes: got?.minutes ?? Math.round((t.minMinutes + t.maxMinutes) / 2),
      skillId: got?.skillId ?? null,
      done: got?.done ?? false,
      source: (got?.source as PlanSlot["source"]) ?? "ai",
    };
  });
}
