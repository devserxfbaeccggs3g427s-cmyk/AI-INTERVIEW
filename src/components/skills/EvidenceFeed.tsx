"use client";

import { cn } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Chip";
import { relativeTime } from "@/lib/dates";
import type { EvidenceFeedItem } from "@/lib/skills-data";

/**
 * Feed "Bằng Chứng Gần Đây" (task 7.5).
 *
 * Timeline dọc, sắp xếp **thời gian giảm dần** (đã sort ở server trong
 * `getRecentEvidences`).
 *
 * Màu `RatingBadge` theo design.md §4.3: 4 = primary · 3 = tertiary ·
 * 2 = secondary · 1 = outline.
 *
 * Xem tasks.md 7.5 · design.md §4.3.
 */

/** Badge rating 1–4 — màu theo quy tắc design.md §4.3. */
export function RatingBadge({ rating }: { rating: number }) {
  const tone =
    rating >= 4 ? "primary" : rating === 3 ? "tertiary" : rating === 2 ? "secondary" : "outline";
  return (
    <Badge tone={tone} className="font-code-md">
      ★ {rating}/4
    </Badge>
  );
}

export function EvidenceFeed({
  items,
  onSelectSkill,
}: {
  items: EvidenceFeedItem[];
  /** Bấm vào dòng → chọn node tương ứng trong cây. */
  onSelectSkill?: (skillId: string) => void;
}) {
  return (
    <Card tone="base" data-testid="evidence-feed">
      <CardHeader
        title="Bằng Chứng Gần Đây"
        subtitle="Feed xác thực trực tiếp từ các phiên làm việc trong SQLite."
        icon="history"
      />

      {items.length === 0 ? (
        <p className="text-body-sm text-outline">
          Chưa có bằng chứng nào. Bấm &quot;Luyện tập đo lường ngay&quot; để tạo bằng chứng đầu tiên.
        </p>
      ) : (
        <ol className="relative space-y-gutter-md" aria-live="polite">
          {/* Đường timeline dọc. */}
          <span
            className="absolute left-[0.4375rem] top-1 h-[calc(100%-0.5rem)] w-px bg-outline-variant/40"
            aria-hidden
          />
          {items.map((item) => (
            <li key={item.id} className="relative pl-gutter-lg">
              <span
                className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-[9999px] bg-primary ring-2 ring-surface-container"
                aria-hidden
              />
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <span className="font-code-md text-label-sm text-outline">
                  {relativeTime(item.createdAt)}
                </span>
                <RatingBadge rating={item.rating} />
              </div>

              <p className="mt-0.5 text-body-md text-on-surface">{item.title}</p>

              {item.content ? (
                <p className="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">
                  {item.content}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => onSelectSkill?.(item.skillId)}
                className={cn(
                  "mt-1 font-code-md text-label-sm text-secondary transition-colors",
                  "hover:underline",
                )}
              >
                Hoạt động: {item.activityLabel} · {item.skillName}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-gutter border-t border-outline-variant/30 pt-gutter">
        <Label>Xem toàn bộ {items.length} bằng chứng gần đây</Label>
      </div>
    </Card>
  );
}
