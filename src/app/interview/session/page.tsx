import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

import { InterviewSession } from "@/components/interview/interview-session";

export const dynamic = "force-dynamic";

/**
 * S11 — Phiên phỏng vấn (`/interview/session?id=…`).
 *
 * ⚠️ FR-MI-05 — trả điểm chi tiết từng lượt (rubric), không chỉ tổng.
 */
export default async function InterviewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const id = params.id;

  if (!id) {
    return (
      <div className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Phiên phỏng vấn
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Thiếu id phiên — hãy bắt đầu từ trang thiết lập.
        </p>
      </div>
    );
  }

  const session = await prisma.interviewSession.findUnique({
    where: { id },
    select: {
      id: true,
      plannedCount: true,
      askedCount: true,
      status: true,
      totalScore: true,
      sessionType: true,
      focusHint: true,
      profile: { select: { label: true, jobTitle: true, seniority: true } },
      turns: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          question: true,
          kind: true,
          skillId: true,
          skillName: true,
          answer: true,
          scores: true,
          behavioralScores: true,
          total: true,
          feedback: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    return (
      <div className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Phiên phỏng vấn
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Không tìm thấy phiên này.
        </p>
      </div>
    );
  }

  return (
    <InterviewSession
      session={{
        ...session,
        turns: session.turns.map((turn) => ({
          ...turn,
          createdAt: turn.createdAt.toISOString(),
        })),
      }}
      aiEnabled={!env.isOffline}
    />
  );
}
