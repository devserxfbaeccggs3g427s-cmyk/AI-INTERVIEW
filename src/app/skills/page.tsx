import { SkillsView } from "@/app/skills/skills-view";
import { PageHeader } from "@/components/shell/PageHeader";
import { getFocusSkillId } from "@/lib/focus";
import {
  getRecentEvidences,
  getSkillTreeNodes,
  getSkillsKpi,
} from "@/lib/skills-data";

/**
 * S03 — Cây kỹ năng & bằng chứng (`/skills`).
 *
 * Server Component: đọc cây + KPI + feed từ DB rồi đẩy xuống `SkillsView`
 * (Client Component) để chọn node / đặt trọng tâm.
 *
 * Xem tasks.md 7.1 / 7.6 · design.md §4.3 · FR-SK-01.
 */
export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const [nodes, focusId] = await Promise.all([getSkillTreeNodes(), getFocusSkillId()]);

  const [kpi, evidences] = await Promise.all([
    getSkillsKpi(nodes, focusId),
    getRecentEvidences(20),
  ]);

  // Node đầu tiên được chọn mặc định — panel giữa không bao giờ trống.
  const initialSelectedId = focusId ?? nodes[0]?.id ?? null;

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow={
          <>
            <span>Cây kỹ năng</span>
            <span aria-hidden>·</span>
            <span>3 tầng · 4 domain</span>
          </>
        }
        title="Cây Kỹ Năng & Bằng Chứng"
        description="Không dùng phần trăm ước lượng. Mọi nấc thăng cấp từ 0 đến 5 đều yêu cầu mốc bằng chứng đo lường thật."
      />

      <SkillsView
        nodes={nodes}
        kpi={kpi}
        evidences={evidences}
        initialFocusId={focusId}
        initialSelectedId={initialSelectedId}
      />
    </div>
  );
}
