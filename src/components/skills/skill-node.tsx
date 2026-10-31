import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { LevelScale } from "@/components/skills/level-scale";
import { cn } from "@/lib/cn";
import type { SkillNodeDTO } from "@/lib/skills";

/**
 * Một node trong cây kỹ năng (FR-SK-01, FR-SK-07).
 *
 * ⚠️ NFR-SK-05 — cây là `<ul>/<li>` có nhãn; node tầng 1 là `<h3>`.
 * ⚠️ NFR-SK-07 — chỉ dùng class token, không hardcode hex (kể cả đường nối
 * dashed của cây).
 */
export interface SkillNodeProps {
  node: SkillNodeDTO;
  /** Tầng trong cây: 1 = domain, 2 = kỹ năng, 3 = mục con. */
  depth: 1 | 2 | 3;
  /** Skill đang là trọng tâm hôm nay. */
  focusSkillId: string | null;
}

export function SkillNode({ node, depth, focusSkillId }: SkillNodeProps) {
  const isFocus = node.id === focusSkillId;
  const isDomain = depth === 1;

  return (
    <li className="relative">
      {isDomain && (
        // ⚠️ `<h2>` (không phải `<h3>`) — trang có `<h1>` nên `<h3>` sẽ bị axe
        // báo `heading-order` (moderate) vì nhảy cấp.
        <h2 className="flex items-center gap-space-sm font-headline-sm text-headline-sm text-on-surface">
          <Icon name="account_tree" size={16} className="text-outline" />
          {node.name}
          <LevelScale
            level={node.computedLevel}
            targetLevel={node.targetLevel}
            evidenceCount={node.evidenceCount}
            strongEvidenceCount={node.strongEvidenceCount}
            className="ml-auto w-32"
          />
        </h2>
      )}

      {!isDomain && (
        <div
          className={cn(
            "rounded-lg p-space-sm transition",
            isFocus
              ? "bg-surface-container-high ring-1 ring-primary"
              : "bg-surface-container-low hover:bg-surface-container",
          )}
        >
          <div className="flex items-start justify-between gap-space-sm">
            <div className="min-w-0">
              <Link
                href={`/skills/${node.id}`}
                className="font-label-md text-label-md text-on-surface transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {node.name}
                {isFocus && (
                  <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 font-label-sm text-label-sm text-primary">
                    Trọng tâm
                  </span>
                )}
              </Link>

              <p className="mt-space-xs font-label-sm text-label-sm text-outline">
                {node.evidenceCount} bằng chứng
                {node.strongEvidenceCount > 0 && ` · ${node.strongEvidenceCount} đạt`}
                {node.averageRating !== null && ` · TB ${node.averageRating}`}
              </p>
            </div>

            <LevelScale
              level={node.computedLevel}
              targetLevel={node.targetLevel}
              evidenceCount={node.evidenceCount}
              strongEvidenceCount={node.strongEvidenceCount}
              compact
              className="w-20 shrink-0"
            />
          </div>
        </div>
      )}

      {node.children.length > 0 && (
        <ul
          className={cn(
            "mt-space-sm grid gap-space-sm",
            depth === 1
              ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1",
          )}
        >
          {node.children.map((child) => (
            <SkillNode
              key={child.id}
              node={child}
              depth={(depth + 1) as 2 | 3}
              focusSkillId={focusSkillId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
