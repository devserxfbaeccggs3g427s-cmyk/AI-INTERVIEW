import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

import { InterviewReport } from "@/components/interview/interview-report";

export const dynamic = "force-dynamic";

/**
 * S18 — Báo cáo kết quả phỏng vấn (`/interview/report?id=…`).
 *
 * ⚠️ FR-MI-09 — 3 điểm mạnh (có trích dẫn nguyên văn) + 3 điểm yếu +
 * đề xuất luyện tiếp trỏ về cây kỹ năng.
 */
export default async function InterviewReportPage({
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
          Kết quả phỏng vấn
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Thiếu id phiên — hãy mở từ danh sách phiên.
        </p>
      </div>
    );
  }

  const session = await prisma.interviewSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      totalScore: true,
      report: true,
      profile: { select: { label: true, jobTitle: true } },
    },
  });

  if (!session) {
    return (
      <div className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Kết quả phỏng vấn
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Không tìm thấy phiên này.
        </p>
      </div>
    );
  }

  return (
    <InterviewReport
      sessionId={session.id}
      report={
        session.report
          ? (session.report as unknown as React.ComponentProps<
              typeof InterviewReport
            >["report"])
          : null
      }
      totalScore={session.totalScore}
      profileLabel={session.profile.label}
      jobTitle={session.profile.jobTitle}
      aiEnabled={!env.isOffline}
    />
  );
}
