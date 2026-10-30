"use client";

import { cn } from "@/components/ui/Button";
import { Badge, ProgressSegments } from "@/components/ui/Chip";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";
import type { SkillNodeDTO } from "@/lib/skills-data";
import { useMemo } from "react";

/**
 * Cây kỹ năng 3 tầng (task 7.1) — FR-SK-01: Domain → Kỹ năng → Mục kỹ năng con.
 *
 * Tầng 1 là **4 domain cố định** (`DOMAINS`), không phụ thuộc DB — luôn hiện đủ
 * 4 nhóm kể cả khi domain đó chưa có skill nào.
 *
 * ⚠️ Bug mockup: `button:has(.text-tertiary)` bind nhầm phần tử cha → ở đây ta
 * dùng `data-skill-id` + React state, không truy vấn DOM (design.md §4.3).
 *
 * Xem tasks.md 7.1 · design.md §4.3 · FR-SK-01 / FR-SK-06.
 */

/** Badge level 0–5 — thang đo rõ ràng, không phần trăm mơ hồ (FR-SK-06). */
export function LevelBadge({
  level,
  targetLevel,
  className,
}: {
  level: number;
  targetLevel: number;
  className?: string;
}) {
  return (
    <Badge
      tone={level >= targetLevel ? "primary" : level > 0 ? "tertiary" : "outline"}
      className={cn("font-code-md", className)}
    >
      {level}/{targetLevel}
    </Badge>
  );
}

type TreeProps = {
  nodes: SkillNodeDTO[];
  /** Id node đang chọn. */
  selectedId: string | null;
  /** Id node là trọng tâm hôm nay. */
  focusId: string | null;
  onSelect: (skillId: string) => void;
};

/** Node tầng 2/3 — dùng chung cho skill gốc và mục con. */
function SkillNodeRow({
  node,
  isSelected,
  isFocus,
  onSelect,
}: {
  node: SkillNodeDTO;
  isSelected: boolean;
  isFocus: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-skill-id={node.id}
      aria-pressed={isSelected}
      onClick={() => onSelect(node.id)}
      className={cn(
        "w-full rounded-lg border px-space-md py-space-sm text-left transition-colors",
        isSelected
          ? "border-primary bg-primary-container/15 ring-1 ring-primary"
          : "border-outline-variant/30 bg-surface-container-low hover:bg-surface-container",
      )}
    >
      <div className="flex items-center justify-between gap-space-sm">
        <span className="flex min-w-0 items-center gap-space-sm">
          <span className="truncate font-label-md text-on-surface">{node.name}</span>
          {isFocus ? (
            <Badge tone="tertiary" className="shrink-0">
              Trọng tâm
            </Badge>
          ) : null}
        </span>
        <LevelBadge level={node.level} targetLevel={node.targetLevel} className="shrink-0" />
      </div>

      <div className="mt-space-xs flex items-center justify-between gap-space-sm">
        <span className="font-code-md text-label-sm text-on-surface-variant">
          {node.evidenceCount} bằng chứng
        </span>
        <span className="font-code-md text-label-sm text-outline">
          {node.averageRating > 0 ? `★ ${node.averageRating}` : "Chưa đánh giá"}
        </span>
      </div>

      {/* Thanh segment: 1 segment = 1 level (design.md §4.3). */}
      <ProgressSegments
        current={node.level}
        total={Math.max(node.targetLevel, node.level, 1)}
        className="mt-space-xs"
      />
    </button>
  );
}

export function SkillTree({ nodes, selectedId, focusId, onSelect }: TreeProps) {
  // Gom theo domain → tầng 2 (skill gốc) → tầng 3 (mục con).
  const grouped = useMemo(() => {
    const map = new Map<Domain, { roots: SkillNodeDTO[]; children: SkillNodeDTO[] }>();
    for (const domain of DOMAINS) {
      map.set(domain, { roots: [], children: [] });
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const node of nodes) {
      const bucket = map.get(node.domain);
      if (!bucket) continue;
      // Node có cha thuộc cùng domain → tầng 3; ngược lại là tầng 2.
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (node.parentId && parent && parent.domain === node.domain) {
        bucket.children.push(node);
      } else {
        bucket.roots.push(node);
      }
    }
    return map;
  }, [nodes]);

  return (
    <div className="space-y-gutter-md" data-testid="skill-tree">
      {DOMAINS.map((domain, index) => {
        const bucket = grouped.get(domain) ?? { roots: [], children: [] };
        const domainNodes = [...bucket.roots, ...bucket.children];
        const domainEvidence = domainNodes.reduce((acc, n) => acc + n.evidenceCount, 0);
        const maxLevel = domainNodes.reduce((acc, n) => Math.max(acc, n.level), 0);
        const isFocusDomain = domainNodes.some((n) => n.id === focusId);

        return (
          <section
            key={domain}
            data-domain={domain}
            aria-label={`Domain ${DOMAIN_LABELS[domain]}`}
            className={cn(
              "rounded-xl border p-gutter transition-colors",
              isFocusDomain
                ? "border-primary/50 bg-primary-container/10"
                : "border-outline-variant/30 bg-surface-container-low",
            )}
          >
            <header className="flex items-start justify-between gap-space-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-space-sm">
                  <span className="font-code-md text-label-sm text-outline">
                    DOMAIN {index + 1} / 4
                  </span>
                  {isFocusDomain ? (
                    <Badge tone="primary">Trọng tâm hôm nay</Badge>
                  ) : null}
                </div>
                <h3 className="mt-0.5 font-headline-sm text-on-surface">
                  {DOMAIN_LABELS[domain]}
                </h3>
                <p className="font-code-md text-label-sm text-on-surface-variant">
                  Thang {maxLevel}/5 · {domainEvidence} bằng chứng
                </p>
              </div>
              <span className="material-symbols-outlined shrink-0 text-primary" aria-hidden>
                account_tree
              </span>
            </header>

            {/* Tầng 2 — skill thuộc domain. */}
            <div className="mt-gutter space-y-space-sm">
              {bucket.roots.length === 0 ? (
                <p className="text-body-sm text-outline">
                  Chưa có kỹ năng nào trong domain này.
                </p>
              ) : (
                bucket.roots.map((node) => (
                  <div key={node.id} className="space-y-space-sm">
                    <SkillNodeRow
                      node={node}
                      isSelected={selectedId === node.id}
                      isFocus={focusId === node.id}
                      onSelect={onSelect}
                    />
                    {/* Tầng 3 — mục kỹ năng con. */}
                    {bucket.children
                      .filter((c) => c.parentId === node.id)
                      .map((child) => (
                        <div key={child.id} className="ml-space-lg pl-space-md">
                          <SkillNodeRow
                            node={child}
                            isSelected={selectedId === child.id}
                            isFocus={focusId === child.id}
                            onSelect={onSelect}
                          />
                        </div>
                      ))}
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
