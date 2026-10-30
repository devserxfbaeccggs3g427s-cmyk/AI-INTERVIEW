import "server-only";
import { prisma } from "@/lib/db";
import { levelForEvidenceCount, progressToNextLevel } from "@/lib/levels";

/**
 * Server-side helpers that use Prisma — **chỉ** dùng trong API routes / Server Actions.
 * Import này sẽ **không** bị bundle vào client components.
 */

/**
 * Tính lại level của skill dựa trên evidence rating >= 3.
 * Dùng sau khi ghi Evidence mới (API `/api/log`).
 */
export async function recomputeSkillLevel(skillId: string): Promise<number> {
  const count = await prisma.evidence.count({
    where: { skillId, rating: { gte: 3 } },
  });
  const newLevel = levelForEvidenceCount(count);
  await prisma.skill.update({
    where: { id: skillId },
    data: { level: newLevel },
  });
  return newLevel;
}

/**
 * Trả về thống kê evidence của skill để hiển thị ở UI (level, count, progress).
 * Dùng cho server-side data fetching (S01, S03, S04).
 */
export async function skillEvidenceStats(skillId: string): Promise<{
  level: number;
  evidenceCount: number;
  progressToNext: number;
}> {
  const count = await prisma.evidence.count({
    where: { skillId, rating: { gte: 3 } },
  });
  const level = levelForEvidenceCount(count);
  return {
    level,
    evidenceCount: count,
    progressToNext: progressToNextLevel(level, count),
  };
}