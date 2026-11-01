import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { rankWeakSkills } from "@/lib/interview-weak-skills";

import { InterviewSetup } from "@/components/interview/interview-setup";

export const dynamic = "force-dynamic";

/**
 * S11 — Thiết lập phỏng vấn (`/interview/setup`).
 *
 * ⚠️ FR-MI-08 — gợi ý kỹ năng yếu tính **cục bộ** từ Evidence (không cần AI).
 */
export default async function InterviewSetupPage() {
  const [profiles, evidences] = await Promise.all([
    prisma.interviewProfile.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        jobTitle: true,
        seniority: true,
        language: true,
        questionKinds: true,
        focusSkills: true,
        answerMode: true,
        englishClarity: true,
      },
    }),
    prisma.evidence.findMany({
      select: {
        skillId: true,
        rating: true,
        skill: { select: { name: true, level: true } },
      },
    }),
  ]);

  // Gom Evidence theo skill.
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

  const weakSkills = rankWeakSkills(stats, { pinCount: 2 }).map((item) => ({
    skillId: item.skillId,
    name: item.name,
    band: item.band,
    score: item.score,
  }));

  return (
    <InterviewSetup
      profiles={profiles}
      weakSkills={weakSkills}
      aiEnabled={!env.isOffline}
    />
  );
}
