import {
  getBioConstraints,
  getBreakthroughFocus,
  getLatestGenerationCost,
  getPlanItems,
} from "@/lib/daily-loop";
import { parseDateKey, toDateKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { generateFallbackPlan, listSkillsForPlan } from "@/lib/plan";

import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { PlanSidebar } from "@/components/plan/plan-sidebar";

export const dynamic = "force-dynamic";

/**
 * S02 — Sinh kế hoạch AI (`/plan`).
 *
 * Server Component: đọc `?date=`, nạp kế hoạch hiện có, rồi giao cho
 * `<PlanWorkspace>` (Client) để stream + sửa inline + duyệt.
 *
 * Nếu offline và chưa có kế hoạch ⇒ dựng sẵn từ bộ sinh rule cục bộ để S02
 * **không trống** khi mở (AC-DL-5).
 */
export default async function PlanPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await props.searchParams;

  const date = parseDateKey(dateParam ?? toDateKey(new Date())) ?? new Date();
  const dateKey = toDateKey(date);

  const aiAvailable = !env.isOffline;

  let items = await getPlanItems(date);
  const lockedSlots = items.filter((item) => item.done).map((item) => item.slot);

  // Offline + chưa có kế hoạch → dựng sẵn từ bộ sinh cục bộ.
  if (items.length === 0 && !aiAvailable) {
    const skills = await listSkillsForPlan();
    const fallback = generateFallbackPlan(skills, { date });
    items = fallback.map((item) => ({
      slot: item.slot,
      domain: item.domain,
      kind: item.kind,
      action: item.action,
      detail: item.detail,
      minutes: item.minutes,
      skillId: item.skillId,
      skillName: item.skillName,
      done: false,
      source: "fallback" as const,
    }));
  }

  const [bio, focus, cost] = await Promise.all([
    getBioConstraints(date),
    getBreakthroughFocus(),
    getLatestGenerationCost(),
  ]);

  return (
    <div className="grid gap-gutter-lg lg:grid-cols-[1fr_20rem]">
      <PlanWorkspace
        date={dateKey}
        initialItems={items}
        aiAvailable={aiAvailable}
        lockedSlots={lockedSlots}
      />
      <PlanSidebar bio={bio} focus={focus} cost={cost} />
    </div>
  );
}
