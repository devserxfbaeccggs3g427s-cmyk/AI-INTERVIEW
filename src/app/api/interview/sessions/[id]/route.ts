import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/interview/sessions/[id] — chi tiết phiên + các lượt.
 *
 * ⚠️ FR-MI-05 — trả điểm chi tiết từng lượt (rubric), không chỉ tổng.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const session = await prisma.interviewSession.findUnique({
    where: { id },
    select: {
      id: true,
      profileId: true,
      plannedCount: true,
      askedCount: true,
      status: true,
      totalScore: true,
      skillsFocused: true,
      questionKinds: true,
      answerMode: true,
      englishClarity: true,
      sessionType: true,
      focusHint: true,
      report: true,
      startedAt: true,
      endedAt: true,
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
          nextQuestion: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên phỏng vấn"));
  }

  return toResponse(
    ok({
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        turns: session.turns.map((turn) => ({
          ...turn,
          createdAt: turn.createdAt.toISOString(),
        })),
      },
    }),
  );
}
