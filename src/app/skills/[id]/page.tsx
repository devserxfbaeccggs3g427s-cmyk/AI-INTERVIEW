import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { AiSuggestionCard } from "@/components/skills/AiSuggestionCard";
import { EvidenceTable } from "@/components/skills/EvidenceTable";
import { LevelChecklist } from "@/components/skills/LevelChecklist";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Chip";
import { LEVEL_THRESHOLDS } from "@/lib/levels";
import {
  buildLevelChecklist,
  buildPracticeSuggestion,
  getActivityDistribution,
  getEvidenceRows,
  getSkillDetail,
  getWeeklyProgress,
} from "@/lib/skills-data";
import { DOMAIN_LABELS } from "@/lib/types";
import { notFound } from "next/navigation";

/**
 * S04 — Chi tiết kỹ năng (`/skills/[id]`).
 *
 * Next 15: `params` là **Promise** → phải `await` (design.md §3.5).
 *
 * Layout 12 cột: trái 8 (biểu đồ + bảng) · phải 4 (tiêu chuẩn + đề xuất).
 *
 * Xem tasks.md 7.7 / 7.8 / 7.9 / 7.10 / 7.11 / 7.12 · design.md §4.4.
 */
export const dynamic = "force-dynamic";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 15: `params` là Promise → `await` trước khi dùng.
  const { id } = await params;

  const detail = await getSkillDetail(id);
  if (!detail) notFound();

  const [rows, distribution, weekly] = await Promise.all([
    getEvidenceRows(detail.id),
    getActivityDistribution(detail.id),
    getWeeklyProgress(detail.id, 8),
  ]);

  const criteria = buildLevelChecklist(
    detail.level,
    detail.targetLevel,
    detail.qualifyingCount,
  );

  const suggestion = buildPracticeSuggestion(detail, rows);

  // Ngưỡng level: mốc bằng chứng cần có để đạt target level.
  const threshold =
    LEVEL_THRESHOLDS[detail.targetLevel] ??
    LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] ??
    0;

  // Breadcrumb 4 cấp: Trang chủ › Cây kỹ năng › <domain> › <skill>.
  const domainItem = detail.ancestors[0];
  const breadcrumbItems = [
    { label: "Trang chủ", href: "/" },
    { label: "Cây kỹ năng", href: "/skills" },
    ...(domainItem
      ? [{ label: DOMAIN_LABELS[detail.domain], href: "/skills" }]
      : [{ label: DOMAIN_LABELS[detail.domain], href: "/skills" }]),
    { label: detail.name },
  ];

  return (
    <div className="space-y-gutter-lg">
      <Breadcrumb items={breadcrumbItems} />

      <PageHeader
        eyebrow={
          <>
            <span>Chi tiết kỹ năng</span>
            <span aria-hidden>·</span>
            <span>{DOMAIN_LABELS[detail.domain]}</span>
          </>
        }
        title={detail.name}
        description="Định lượng thực tế 100% bằng chứng — 1 bằng chứng = 1 hành động đo lường."
      />

      {/* ── 4 số liệu (task 7.7) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4" data-testid="skill-stats">
        <Card tone="base">
          <Stat
            label="Cấp độ hiện tại"
            value={
              <span className="font-code-md">
                {detail.level}/{detail.targetLevel}
              </span>
            }
            hint={`Mục tiêu cấp ${detail.targetLevel}`}
            icon="stairs"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Số bằng chứng"
            value={detail.evidenceCount}
            hint={`${detail.qualifyingCount} bằng chứng ≥ 3★`}
            icon="fact_check"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Thời gian tích lũy"
            value={`${(detail.minutes / 60).toFixed(1)}h`}
            hint={`${detail.minutes} phút`}
            icon="schedule"
          />
        </Card>
        <Card tone="base">
          <Stat
            label="Điểm trung bình"
            value={detail.averageRating > 0 ? detail.averageRating : "—"}
            hint="Thang 1–4"
            icon="star"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-gutter-lg xl:grid-cols-12">
        {/* ── Trái 8 cột: biểu đồ + bảng ─────────────────────────────────── */}
        <div className="space-y-gutter-lg xl:col-span-8">
          <Card tone="base">
            <div className="mb-gutter">
              <h2 className="font-headline-md text-on-surface">Tiến trình xác thực</h2>
              <p className="text-body-sm text-on-surface-variant">
                Tích lũy bằng chứng theo tuần — chỉ tính rating ≥ 3.
              </p>
            </div>
            <LineChart
              data={weekly}
              threshold={threshold}
              thresholdLabel={`Ngưỡng Cấp ${detail.targetLevel}`}
            />
          </Card>

          <Card tone="base">
            <div className="mb-gutter">
              <h2 className="font-headline-md text-on-surface">Phân bổ hoạt động</h2>
              <p className="text-body-sm text-on-surface-variant">
                6 danh mục — Học · Luyện tập · Viết · Nói · Ôn · Nhật ký.
              </p>
            </div>
            <BarChart data={distribution} />
          </Card>

          <EvidenceTable rows={rows} />
        </div>

        {/* ── Phải 4 cột: tiêu chuẩn + đề xuất ────────────────────────────── */}
        <div className="space-y-gutter-lg xl:col-span-4">
          <LevelChecklist
            criteria={criteria}
            currentLevel={detail.level}
            targetLevel={detail.targetLevel}
            qualifyingCount={detail.qualifyingCount}
          />

          <AiSuggestionCard
            skillId={detail.id}
            skillName={detail.name}
            domain={detail.domain}
            suggestion={suggestion}
          />
        </div>
      </div>
    </div>
  );
}
