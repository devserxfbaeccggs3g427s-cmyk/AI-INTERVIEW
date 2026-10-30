/**
 * `GET /api/interview/session/[sessionId]` — lấy dữ liệu phiên cho S17.
 */

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: {
      turns: { orderBy: { index: "asc" } },
      profile: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Phiên không tồn tại" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: session.id,
      profileId: session.profileId,
      plannedCount: session.plannedCount,
      askedCount: session.askedCount,
      status: session.status,
      totalScore: session.totalScore,
      timePerQuestion: 300, // default, could be stored in session
      turns: session.turns.map((t) => ({
        index: t.index,
        question: t.question,
        kind: t.kind,
        skillName: t.skillName,
        answer: t.answer,
        scores: t.scores,
        total: t.total,
        feedback: t.feedback,
        nextQuestion: t.nextQuestion,
      })),
    },
  });
}