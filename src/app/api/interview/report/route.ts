import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ReportSchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * POST /api/interview/report — sinh báo cáo kết quả phiên (S18, FR-MI-09).
 *
 * ⚠️ FR-MI-09 — báo cáo có **3 điểm mạnh** (có trích dẫn nguyên văn đã
 * kiểm chứng) + **3 điểm yếu** + đề xuất luyện tiếp trỏ về cây kỹ năng.
 *
 * ⚠️ Nếu chưa có report ⇒ trả `null` (không bịa báo cáo).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "sessionId không hợp lệ"));
  }

  const session = await prisma.interviewSession.findUnique({
    where: { id: parsed.data.sessionId },
    select: {
      id: true,
      status: true,
      totalScore: true,
      report: true,
      skillsFocused: true,
      profile: { select: { label: true, jobTitle: true } },
      turns: {
        orderBy: { index: "asc" },
        select: {
          index: true,
          question: true,
          answer: true,
          scores: true,
          behavioralScores: true,
          total: true,
          feedback: true,
        },
      },
    },
  });

  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên phỏng vấn"));
  }

  if (session.status !== "done") {
    return toResponse(fail("conflict", "Phiên chưa kết thúc"));
  }

  // ⚠️ Chưa có report ⇒ trả null, KHÔNG bịa.
  if (!session.report) {
    return toResponse(ok({ report: null, totalScore: session.totalScore }));
  }

  return toResponse(
    ok({
      report: session.report,
      totalScore: session.totalScore,
      profile: session.profile,
      turns: session.turns,
    }),
  );
}
