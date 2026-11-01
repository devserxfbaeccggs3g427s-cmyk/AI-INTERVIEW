import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/interview/sessions?profileId=&status=&limit= — lịch sử phiên.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId");
  const status = url.searchParams.get("status");
  const limit = Number(url.searchParams.get("limit") ?? "20");

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return toResponse(fail("invalid_input", "limit phải trong 1..100"));
  }

  const sessions = await prisma.interviewSession.findMany({
    where: {
      ...(profileId ? { profileId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      profileId: true,
      plannedCount: true,
      askedCount: true,
      status: true,
      totalScore: true,
      sessionType: true,
      focusHint: true,
      startedAt: true,
      endedAt: true,
      profile: { select: { label: true, jobTitle: true } },
    },
  });

  return toResponse(
    ok({
      sessions: sessions.map((session) => ({
        ...session,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
      })),
    }),
  );
}
