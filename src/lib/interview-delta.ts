/**
 * So sánh 2 phiên cùng hồ sơ vai trò (FR-MI-09, AC-13).
 *
 * ⚠️ AC-13 — **không** so sánh chéo hồ sơ. "Phiên trước" = phiên `status='done'`,
 * `profileId` **giống hệt**, `startedAt < current.startedAt`.
 *
 * Nguồn: `.kiro/specs/mock-interview/design.md` §3.7.
 */

import { prisma } from "@/lib/db";
import { computeSessionRubric } from "@/lib/interview-rubric";
import { parseQuestionKind, type QuestionKind, type RubricKey } from "@/lib/interview";

/** Điểm rubric kỹ thuật của 1 phiên. */
export type SessionRubricScores = Record<RubricKey, number>;

export type DeltaDirection = "up" | "down" | "flat";

export interface RubricDelta {
  readonly key: RubricKey;
  readonly current: number;
  readonly previous: number;
  /** `current - previous`, làm tròn 2 chữ số. */
  readonly delta: number;
  readonly direction: DeltaDirection;
}

export interface SessionComparison {
  readonly previousSessionId: string | null;
  readonly previousStartedAt: Date | null;
  readonly previousTotal: number | null;
  readonly totalDelta: number | null;
  readonly rubricDeltas: RubricDelta[];
  readonly hasPrevious: boolean;
}

/** Ngưỡng "flat" — chống nhiễu số thập phân (design.md §3.7). */
export const FLAT_THRESHOLD = 0.05;

/** Tính điểm rubric của 1 phiên từ các lượt đã trả lời. */
export function computeSessionRubricScores(
  turns: ReadonlyArray<{ kind: QuestionKind; scores: unknown }>,
): SessionRubricScores {
  return computeSessionRubric(turns);
}

/** `direction` của 1 delta. */
export function deltaDirection(delta: number): DeltaDirection {
  if (delta > FLAT_THRESHOLD) return "up";
  if (delta < -FLAT_THRESHOLD) return "down";
  return "flat";
}

/** Tính delta giữa 2 bảng điểm rubric. */
export function diffRubric(
  current: SessionRubricScores,
  previous: SessionRubricScores,
): RubricDelta[] {
  const keys = Object.keys(current) as RubricKey[];

  return keys.map((key) => {
    const currentValue = current[key] ?? 0;
    const previousValue = previous[key] ?? 0;
    const delta = Math.round((currentValue - previousValue) * 100) / 100;

    return {
      key,
      current: currentValue,
      previous: previousValue,
      delta,
      direction: deltaDirection(delta),
    };
  });
}

/** Phiên `done` gần nhất trước phiên hiện tại, cùng `profileId`. */
async function loadPreviousSession(profileId: string, startedAt: Date) {
  return prisma.interviewSession.findFirst({
    where: {
      profileId,
      status: "done",
      startedAt: { lt: startedAt },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      totalScore: true,
      turns: {
        where: { answer: { not: null } },
        select: { kind: true, scores: true },
      },
    },
  });
}

/** Điểm rubric của phiên trước từ các lượt đã trả lời. */
function rubricOfTurns(
  turns: ReadonlyArray<{ kind: string; scores: unknown }>,
): SessionRubricScores {
  return computeSessionRubric(
    turns.map((turn) => ({
      kind: parseQuestionKind(turn.kind),
      scores: turn.scores,
    })),
  );
}

/**
 * Tìm phiên `done` gần nhất **trước** phiên hiện tại, **cùng** `profileId`.
 *
 * @returns `null` nếu không có phiên trước ⇒ UI hiện "Phiên đầu tiên với hồ sơ
 * này — chưa có dữ liệu so sánh" (không hiện `+0.0`).
 */
export async function findPreviousSession(
  profileId: string,
  startedAt: Date,
): Promise<SessionComparison | null> {
  const previous = await loadPreviousSession(profileId, startedAt);
  if (!previous) return null;

  return {
    previousSessionId: previous.id,
    previousStartedAt: previous.startedAt,
    previousTotal: previous.totalScore,
    totalDelta: null,
    rubricDeltas: [],
    hasPrevious: true,
  };
}

/**
 * So sánh phiên hiện tại với phiên trước cùng hồ sơ — trả về đầy đủ delta.
 */
export async function compareSessions(
  profileId: string,
  startedAt: Date,
  currentRubric: SessionRubricScores,
  currentTotal: number | null,
): Promise<SessionComparison> {
  const previous = await loadPreviousSession(profileId, startedAt);

  if (!previous) {
    return {
      previousSessionId: null,
      previousStartedAt: null,
      previousTotal: null,
      totalDelta: null,
      rubricDeltas: [],
      hasPrevious: false,
    };
  }

  const previousRubric = rubricOfTurns(previous.turns);

  const totalDelta =
    previous.totalScore === null || currentTotal === null
      ? null
      : Math.round((currentTotal - previous.totalScore) * 100) / 100;

  return {
    previousSessionId: previous.id,
    previousStartedAt: previous.startedAt,
    previousTotal: previous.totalScore,
    totalDelta,
    rubricDeltas: diffRubric(currentRubric, previousRubric),
    hasPrevious: true,
  };
}
