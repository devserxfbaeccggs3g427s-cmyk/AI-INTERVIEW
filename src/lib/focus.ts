/**
 * Trọng tâm hôm nay — duy nhất **1 node/ngày**.
 *
 * requirements.md §2.7: "THE SYSTEM SHALL cho phép đánh dấu 1 node là
 * 'Trọng tâm hôm nay' (duy nhất 1 node/ngày), và thuật toán Daily Loop ưu tiên
 * đẩy bài tập/SRS/mock của node đó vào ca làm việc chính."
 *
 * Lưu theo NGÀY (model `FocusTarget`), không lưu trên `Skill` — vì cùng một
 * skill có thể là trọng tâm hôm nay nhưng không phải ngày mai.
 *
 * Xem tasks.md 4.2 / 7.2 · design.md §4.3.
 */

import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";

/** Đặt node làm trọng tâm hôm nay. Ghi đè node cũ của cùng ngày. */
export async function setFocusTarget(
  skillId: string,
  date: Date = new Date(),
): Promise<{ skillId: string; date: Date }> {
  const day = startOfDay(date);

  // `date` là unique → upsert là đủ, không cần xoá thủ công.
  await prisma.focusTarget.upsert({
    where: { date: day },
    create: { date: day, skillId },
    update: { skillId },
  });

  return { skillId, date: day };
}

/** Bỏ trọng tâm hôm nay (nếu có). */
export async function clearFocusTarget(date: Date = new Date()): Promise<void> {
  await prisma.focusTarget.deleteMany({ where: { date: startOfDay(date) } });
}

/** Lấy skillId của trọng tâm hôm nay, hoặc `null`. */
export async function getFocusSkillId(date: Date = new Date()): Promise<string | null> {
  const target = await prisma.focusTarget.findUnique({
    where: { date: startOfDay(date) },
    select: { skillId: true },
  });
  return target?.skillId ?? null;
}

/**
 * Lấy trọng tâm hôm nay kèm thông tin skill đầy đủ.
 *
 * Khi chưa có trọng tâm → tự suy ra từ skill yếu nhất (thiếu bằng chứng nhất
 * so với target level) để S01 không bao giờ trống card hạt nhân.
 */
export async function getFocusSkill(date: Date = new Date()): Promise<{
  skillId: string | null;
  name: string | null;
  level: number;
  targetLevel: number;
  evidenceCount: number;
  accumulatedMinutes: number;
  isManual: boolean;
} | null> {
  const manualId = await getFocusSkillId(date);
  if (manualId) {
    const skill = await prisma.skill.findUnique({
      where: { id: manualId },
      include: {
        evidences: { select: { rating: true } },
        activities: { select: { minutes: true } },
      },
    });
    if (!skill) return null;
    return {
      skillId: skill.id,
      name: skill.name,
      level: skill.level,
      targetLevel: skill.targetLevel,
      evidenceCount: skill.evidences.filter((e) => e.rating >= 3).length,
      accumulatedMinutes: skill.activities.reduce((acc, a) => acc + a.minutes, 0),
      isManual: true,
    };
  }

  const weakest = await findWeakestSkill();
  if (!weakest) return null;
  return { ...weakest, isManual: false };
}

/**
 * Skill yếu nhất = thiếu bằng chứng chất lượng nhiều nhất so với ngưỡng level
 * kế tiếp. Dùng làm trọng tâm tự động khi người dùng chưa chọn.
 */
export async function findWeakestSkill(): Promise<{
  skillId: string;
  name: string;
  level: number;
  targetLevel: number;
  evidenceCount: number;
  accumulatedMinutes: number;
} | null> {
  const skills = await prisma.skill.findMany({
    where: { parentId: null },
    include: {
      evidences: { select: { rating: true } },
      activities: { select: { minutes: true } },
    },
  });

  if (skills.length === 0) return null;

  let best: {
    skillId: string;
    name: string;
    level: number;
    targetLevel: number;
    evidenceCount: number;
    accumulatedMinutes: number;
  } | null = null;
  let bestGap = -1;

  for (const skill of skills) {
    const evidenceCount = skill.evidences.filter((e) => e.rating >= 3).length;
    const gap = skill.targetLevel - skill.level;
    // Ưu tiên skill thiếu bằng chứng nhiều nhất; hoà thì ưu tiên level thấp.
    if (gap > bestGap || (gap === bestGap && best !== null && skill.level < best.level)) {
      bestGap = gap;
      best = {
        skillId: skill.id,
        name: skill.name,
        level: skill.level,
        targetLevel: skill.targetLevel,
        evidenceCount,
        accumulatedMinutes: skill.activities.reduce((acc, a) => acc + a.minutes, 0),
      };
    }
  }

  return best;
}
