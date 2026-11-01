import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { rankWeakSkills } from "@/lib/interview-weak-skills";

export const dynamic = "force-dynamic";

/**
 * GET /api/interview/weak-skills?profileId=&count= — kỹ năng yếu (FR-MI-08).
 *
 * ⚠️ Tính **cục bộ** từ `Evidence` — không cần AI (registry M10).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const countRaw = Number(url.searchParams.get("count") ?? "2");

  if (!Number.isFinite(countRaw) || countRaw < 1 || countRaw > 10) {
    return toResponse(fail("invalid_input", "count phải trong 1..10"));
  }

  // Gom `Evidence` theo skill ⇒ `SkillEvidenceStat`.
  const evidences = await prisma.evidence.findMany({
    select: {
      skillId: true,
      rating: true,
      skill: { select: { id: true, name: true, domain: true, level: true } },
    },
  });

  const bySkill = new Map<
    string,
    { skillId: string; name: string; level: number; ratings: number[] }
  >();

  for (const evidence of evidences) {
    const existing = bySkill.get(evidence.skillId);
    if (existing) {
      existing.ratings.push(evidence.rating);
      continue;
    }

    bySkill.set(evidence.skillId, {
      skillId: evidence.skillId,
      name: evidence.skill.name,
      level: evidence.skill.level,
      ratings: [evidence.rating],
    });
  }

  const stats = [...bySkill.values()].map((entry) => ({
    skillId: entry.skillId,
    name: entry.name,
    level: entry.level,
    evidenceCount: entry.ratings.length,
    avgRating: Number(
      (
        entry.ratings.reduce((sum, rating) => sum + rating, 0) /
        entry.ratings.length
      ).toFixed(2),
    ),
    path: entry.name,
  }));

  const weak = rankWeakSkills(stats, { pinCount: countRaw });

  return toResponse(ok({ weakSkills: weak }));
}
