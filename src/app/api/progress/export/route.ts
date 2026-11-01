import { getProgress, getSkillTrajectories } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/progress/export — xuất JSON tiến độ (FR-PR-06, AC-RP-9).
 *
 * ⚠️ AC-RP-9: JSON **không** chứa `ANTHROPIC_API_KEY` hay nội dung nhật ký
 * cá nhân. Chỉ trả số liệu tổng hợp (evidenceByMonth · heatmap · t30 ·
 * practiceTime).
 */
export async function GET(): Promise<Response> {
  const report = await getProgress({ domain: "all", days: 180 });
  const trajectories = await getSkillTrajectories(180);

  const payload = {
    exportedAt: new Date().toISOString(),
    days: report.days,
    levelAvg: report.levelAvg,
    leafCount: report.leafCount,
    evidenceCount: report.evidenceCount,
    strongEvidenceCount: report.strongEvidenceCount,
    evidenceByMonth: report.evidenceByMonth,
    heatmap: report.heatmap,
    t30: report.t30,
    practiceTime: report.practiceTime,
    practiceTotalMinutes: report.practiceTotalMinutes,
    retention: report.retention,
    goal: report.goal,
    trajectories,
  };

  const filename = `progress-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
