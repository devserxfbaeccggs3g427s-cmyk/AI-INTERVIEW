import { Icon } from "@/components/ui/icon";
import { SkillNode } from "@/components/skills/skill-node";
import type { SkillTreeDTO } from "@/lib/skills";

/**
 * Cây kỹ năng 3 tầng (FR-SK-01, FR-SK-07).
 *
 * ⚠️ NFR-SK-03 — **không số liệu hardcode trong JSX**: mọi con số đến từ
 * truy vấn (`SkillTreeDTO`).
 */
export interface SkillTreeProps {
  tree: SkillTreeDTO;
}

export function SkillTree({ tree }: SkillTreeProps) {
  return (
    <section aria-label="Cây kỹ năng" className="space-y-gutter-lg">
      {/* Thống kê tổng quan */}
      <div className="grid grid-cols-2 gap-gutter-md lg:grid-cols-4">
        <StatTile
          label="Tổng domain"
          value={String(tree.domainCount)}
          suffix="nhóm"
          icon="account_tree"
        />
        <StatTile
          label="Tổng bằng chứng"
          value={String(tree.totalEvidence)}
          suffix="bản ghi"
          icon="verified"
        />
        <StatTile
          label="Bằng chứng đạt chuẩn"
          value={String(tree.totalStrongEvidence)}
          suffix="≥ 3★"
          icon="star"
        />
        <StatTile
          label="Mục kỹ năng"
          value={String(tree.leafCount)}
          suffix="mục"
          icon="list"
        />
      </div>

      {/* Cây */}
      {tree.domains.length === 0 ? (
        <p className="rounded-xl bg-surface-container p-space-lg text-body-md text-body-md text-on-surface-variant">
          Chưa có cây kỹ năng — chạy <code className="font-code-md text-code-md">npm run db:seed</code>{" "}
          để nạp dữ liệu.
        </p>
      ) : (
        // ⚠️ `SkillNode` tự render `<li>` — không bọc thêm `<li>` ở đây,
        // nếu không `<li>` sẽ lồng nhau và axe báo `listitem` (serious).
        <ul className="space-y-gutter-lg">
          {tree.domains.map((domain) => (
            <SkillNode
              key={domain.id}
              node={domain}
              depth={1}
              focusSkillId={tree.focusSkillId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: string;
}) {
  return (
    <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container p-space-md">
      <span className="flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="font-headline-md text-headline-md text-on-surface tabular">
          {value}
        </span>
        <span className="font-label-sm text-label-sm text-outline">{suffix}</span>
      </span>
    </div>
  );
}
