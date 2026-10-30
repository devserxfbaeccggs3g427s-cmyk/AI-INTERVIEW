"use client";

import { EvidenceFeed } from "@/components/skills/EvidenceFeed";
import { SkillDetailPanel } from "@/components/skills/SkillDetailPanel";
import { SkillTree } from "@/components/skills/SkillTree";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Chip";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { EvidenceFeedItem, SkillNodeDTO, SkillsKpi } from "@/lib/skills-data";

/**
 * S03 — Cây kỹ năng (3 cột): cây · panel node đang chọn · feed bằng chứng.
 *
 * Client Component vì có state node đang chọn + trọng tâm. Dữ liệu ban đầu
 * đến từ Server Component (`src/app/skills/page.tsx`).
 *
 * Xem tasks.md 7.1 / 7.2 / 7.5 / 7.6 · design.md §4.3.
 */
export function SkillsView({
  nodes,
  kpi,
  evidences,
  initialFocusId,
  initialSelectedId,
}: {
  nodes: SkillNodeDTO[];
  kpi: SkillsKpi;
  evidences: EvidenceFeedItem[];
  initialFocusId: string | null;
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const [focusId, setFocusId] = useState<string | null>(initialFocusId);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  /**
   * Sau khi đổi trọng tâm hoặc tạo node mới → refresh server để KPI + cây
   * cập nhật. `router.refresh()` giữ nguyên state client.
   */
  const handleFocusChanged = useCallback(
    (skillId: string | null) => {
      setFocusId(skillId);
      router.refresh();
    },
    [router],
  );

  const handleNodeCreated = useCallback(
    (skillId: string) => {
      setSelectedId(skillId);
      router.refresh();
    },
    [router],
  );

  return (
    <div className="space-y-gutter-lg">
      {/* ── KPI đầu trang (task 7.6) — số liệu thật từ DB ─────────────────── */}
      <div
        className="grid grid-cols-2 gap-gutter lg:grid-cols-4"
        data-testid="skills-kpi"
      >
        <Card tone="base">
          <Stat
            label="Tổng Domain"
            value={kpi.domainCount}
            hint="nhóm kỹ năng đang hoạt động"
            icon="account_tree"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Tổng Bằng Chứng"
            value={kpi.totalEvidence}
            hint="records đã ghi nhận"
            icon="fact_check"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Trọng Tâm Hôm Nay"
            value={kpi.focus.name ?? "Chưa đặt"}
            hint={
              kpi.focus.averageRating > 0
                ? `Rating TB ${kpi.focus.averageRating} / 4.0`
                : "Chưa có bằng chứng"
            }
            icon="bolt"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Kỹ năng Chờ Luyện"
            value={kpi.awaitingCount}
            hint="mục chưa đạt mức mục tiêu"
            icon="pending_actions"
          />
        </Card>
      </div>

      {/* ── 3 cột: cây · chi tiết · feed ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-gutter-lg xl:grid-cols-12">
        <section className="xl:col-span-4" aria-label="Cây kỹ năng">
          <SkillTree
            nodes={nodes}
            selectedId={selectedId}
            focusId={focusId}
            onSelect={setSelectedId}
          />
        </section>

        <section className="xl:col-span-5" aria-label="Chi tiết node đang chọn">
          <SkillDetailPanel
            node={selectedNode}
            focusId={focusId}
            onFocusChanged={handleFocusChanged}
            onNodeCreated={handleNodeCreated}
          />
        </section>

        <section className="xl:col-span-3" aria-label="Bằng chứng gần đây">
          <EvidenceFeed items={evidences} onSelectSkill={setSelectedId} />
        </section>
      </div>
    </div>
  );
}
