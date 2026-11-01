/**
 * Tạo Activity + Evidence khi phiên chuyển `done` (FR-MI-10, AC-MI-15).
 *
 * ⚠️ AC-MI-15 — **đúng 1** Activity + **đúng 1** Evidence, idempotent theo
 * `session.activityId` (registry `C28`).
 *
 * Nguồn: `.kiro/specs/mock-interview/design.md` §3.8.
 */

import { prisma } from "@/lib/db";
import type { NormalizedReport } from "@/lib/interview-report";

/** Input để persist 1 phiên `done`. */
export interface SessionOutcome {
  readonly sessionId: string;
  readonly profileId: string;
  readonly label: string;
  readonly jobTitle: string;
  readonly language: string;
  readonly totalScore: number;
  readonly answeredCount: number;
  readonly minutes: number;
  readonly primarySkillId: string | null;
  readonly primarySkillName: string | null;
  readonly report: NormalizedReport | null;
}

/** Output — `created: false` khi đã tồn tại (idempotent). */
export interface PersistOutcomeResult {
  readonly activityId: string;
  readonly evidenceId: string | null;
  readonly created: boolean;
}

/**
 * Chọn skill trọng tâm: node trong `skillsFocused` có nhiều lượt hỏi nhất;
 * tie → node yếu nhất (ít bằng chứng nhất).
 */
export function pickPrimarySkill(
  skillsFocused: readonly string[],
  turnSkillIds: ReadonlyArray<string | null>,
): string | null {
  if (skillsFocused.length === 0) return null;

  const counts = new Map<string, number>();
  for (const id of skillsFocused) counts.set(id, 0);

  for (const id of turnSkillIds) {
    if (id && counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = -1;

  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Điểm Evidence (1..4) từ điểm tổng phiên (0..5).
 *
 * ```
 * totalScore >= 4.5 → 4
 * totalScore >= 3.5 → 3
 * totalScore >= 2.5 → 2
 * totalScore       → 1
 * ```
 */
export function toEvidenceRating(totalScore: number): 1 | 2 | 3 | 4 {
  if (!Number.isFinite(totalScore)) return 1;
  if (totalScore >= 4.5) return 4;
  if (totalScore >= 3.5) return 3;
  if (totalScore >= 2.5) return 2;
  return 1;
}

/**
 * Tạo Activity + Evidence trong 1 transaction.
 *
 * Idempotent: `session.activityId` đã có ⇒ không tạo thêm.
 */
export async function persistSessionOutcome(
  outcome: SessionOutcome,
): Promise<PersistOutcomeResult> {
  const session = await prisma.interviewSession.findUnique({
    where: { id: outcome.sessionId },
    select: { id: true, activityId: true },
  });

  if (!session) {
    throw new Error(`Phiên ${outcome.sessionId} không tồn tại`);
  }

  if (session.activityId) {
    return {
      activityId: session.activityId,
      evidenceId: null,
      created: false,
    };
  }

  const title = `Phỏng vấn ${outcome.label}`;
  const content = `${outcome.answeredCount} câu · ${outcome.jobTitle} · ${outcome.language}`;
  const rating = toEvidenceRating(outcome.totalScore);

  const created = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        skillId: outcome.primarySkillId,
        domain: "professional",
        type: "mock_interview",
        minutes: outcome.minutes,
        title,
        content: `${content} · session:${outcome.sessionId}`,
        quality: null,
        aiScore: outcome.totalScore,
        language: outcome.language === "vi" ? "vi" : "en",
      },
    });

    let evidenceId: string | null = null;
    if (outcome.primarySkillId) {
      const evidence = await tx.evidence.create({
        data: {
          activityId: activity.id,
          skillId: outcome.primarySkillId,
          rating,
        },
        select: { id: true },
      });
      evidenceId = evidence.id;
    }

    await tx.interviewSession.update({
      where: { id: outcome.sessionId },
      data: { activityId: activity.id },
    });

    return { activity, evidenceId };
  });

  return {
    activityId: created.activity.id,
    evidenceId: created.evidenceId,
    created: true,
  };
}