import { ProgressReportView } from "@/components/progress/progress-report";
import { getProgress, getSkillTrajectories } from "@/lib/analytics";
import { DOMAINS, type DomainKey } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * S14 — Báo cáo tiến bộ.
 *
 * ⚠️ Render server-side — đọc `?domain=` / `?days=`, validate, query DB.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; days?: string }>;
}) {
  const params = await searchParams;

  const domain: DomainKey | "all" =
    params.domain === "all" || (DOMAINS as readonly string[]).includes(params.domain ?? "")
      ? (params.domain as DomainKey | "all")
      : "all";

  const parsedDays = Number(params.days);
  const days =
    Number.isFinite(parsedDays) && parsedDays >= 30 && parsedDays <= 365
      ? Math.floor(parsedDays)
      : 180;

  const [report, trajectories] = await Promise.all([
    getProgress({ domain, days }),
    getSkillTrajectories(days),
  ]);

  return <ProgressReportView data={report} skillTrajectories={trajectories} />;
}
