import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { EvidenceLog } from "@/components/skills/evidence-log";
import { LevelScale } from "@/components/skills/level-scale";
import { ActivityDistribution } from "@/components/skills/activity-distribution";
import { LevelTimelineChart } from "@/components/skills/level-timeline-chart";
import type { SkillDetailDTO } from "@/lib/skills";

/**
 * S04 — Chi tiết kỹ năng.
 *
 * ⚠️ NFR-SK-03 — không số liệu hardcode: mọi con số đến từ `SkillDetailDTO`.
 */
export interface SkillDetailProps {
  detail: SkillDetailDTO;
  /** Đường dẫn breadcrumb (domain → … → node). */
  path: Array<{ id: string; name: string }>;
}

export function SkillDetail({ detail, path }: SkillDetailProps) {
  const { skill, promotion } = detail;

  return (
    <div className="space-y-gutter-lg">
      {/* Breadcrumb */}
      <nav aria-label="Đường dẫn kỹ năng">
        <ol className="flex flex-wrap items-center gap-1 font-label-sm text-label-sm text-outline">
          {path.map((node, index) => (
            <li key={node.id} className="flex items-center gap-1">
              {index > 0 && <Icon name="chevron_right" size={12} aria-hidden="true" />}
              {index === path.length - 1 ? (
                <span aria-current="page" className="text-on-surface-variant">
                  {node.name}
                </span>
              ) : (
                <Link
                  href={`/skills/${node.id}`}
                  className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {node.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Header */}
      <header className="rounded-xl bg-surface-container p-space-lg shadow-md">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {skill.name}
        </h1>

        <div className="mt-space-sm flex flex-wrap items-center gap-space-md">
          <LevelScale
            level={skill.computedLevel}
            targetLevel={skill.targetLevel}
            evidenceCount={skill.evidenceCount}
            strongEvidenceCount={skill.strongEvidenceCount}
            className="w-40"
          />

          <span className="font-code-md text-code-md text-on-surface-variant tabular">
            {detail.minutesInvested} phút đã bỏ ra
          </span>

          <span className="font-code-md text-code-md text-on-surface-variant tabular">
            Điểm TB{" "}
            {detail.averageRating !== null ? detail.averageRating : "—"}
          </span>
        </div>
      </header>

      {/* Tiêu chuẩn thăng cấp (FR-SK-13) */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Tiêu chuẩn thăng cấp
          </h2>
          <span className="rounded bg-primary/10 px-2 py-0.5 font-code-md text-label-sm font-semibold text-primary">
            Mục tiêu Cấp {skill.targetLevel}
          </span>
        </div>

        <div className="mt-space-md flex flex-col gap-space-sm">
          <div className="flex items-baseline justify-between gap-space-sm">
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Cần: {promotion.requiredEvidence} Bằng chứng (≥ 3★)
            </span>
            <span className="font-code-md text-body-md font-semibold text-primary tabular">
              {promotion.strongEvidence} / {promotion.requiredEvidence}
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={promotion.strongEvidence}
            aria-valuemin={0}
            aria-valuemax={promotion.requiredEvidence}
            aria-label="Số bằng chứng đạt chuẩn so với mục tiêu"
            className="h-2 w-full overflow-hidden rounded-full bg-surface-container"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round((promotion.strongEvidence / Math.max(1, promotion.requiredEvidence)) * 100))}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap justify-between gap-2 font-label-sm text-label-sm text-outline">
            <span>
              {promotion.missingStrongEvidence > 0
                ? `Còn thiếu ${promotion.missingStrongEvidence} bằng chứng`
                : "Đã đủ bằng chứng cho mốc đích"}
            </span>
            <span>
              Nhịp duy trì: {promotion.recentEvidence} bằng chứng / 14 ngày
            </span>
          </div>
        </div>

        <ul className="mt-space-md flex flex-col gap-space-xs">
          <CriterionRow
            label="Đủ bằng chứng ≥ 3★"
            met={!promotion.unmet.includes("evidence")}
            detail={`${promotion.strongEvidence} / ${promotion.requiredEvidence}`}
          />
          <CriterionRow
            label={`Điểm trung bình ≥ ${promotion.requiredAverageRating}`}
            met={!promotion.unmet.includes("rating")}
            detail={
              promotion.currentAverageRating !== null
                ? String(promotion.currentAverageRating)
                : "—"
            }
          />
          <CriterionRow
            label="Duy trì: ≥ 1 bằng chứng trong 14 ngày"
            met={!promotion.unmet.includes("maintenance")}
            detail={`${promotion.recentEvidence}`}
          />
        </ul>
      </section>

      {/* Biểu đồ level theo tuần + phân bổ hoạt động */}
      <div className="grid gap-gutter-lg lg:grid-cols-2">
        <LevelTimelineChart points={detail.timeline} targetLevel={skill.targetLevel} />
        <ActivityDistribution items={detail.activityDistribution} />
      </div>

      {/* Nhật ký bằng chứng */}
      <EvidenceLog evidence={detail.evidence} total={detail.evidenceTotal} shown={20} />
    </div>
  );
}

function CriterionRow({
  label,
  met,
  detail,
}: {
  label: string;
  met: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between gap-space-sm">
      <span className="flex items-center gap-2 text-body-sm text-body-sm text-on-surface-variant">
        <Icon
          name={met ? "check_circle" : "radio_button_unchecked"}
          size={16}
          className={met ? "text-primary" : "text-outline"}
        />
        {label}
      </span>
      <span className="font-code-md text-code-md text-on-surface tabular">{detail}</span>
    </li>
  );
}
