"use client";

import { Badge, ProgressBar, Stat } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import type { CacheStatsDTO } from "@/lib/daily-loop-types";

/**
 * `CacheHitCard` — tỷ lệ cache hit của prompt (task 4.8).
 *
 * Công thức BẮT BUỘC: `sum(cacheRead) / sum(inputTokens + cacheRead)`.
 * Mẫu số = 0 → 0%.
 *
 * Badge `OPTIMAL` / `LOW`: ngưỡng 50% — trên 50% là hiệu quả prompt caching,
 * dưới thì nên gom system prompt thành prefix ổn định (design.md §6.5).
 *
 * Xem design.md §4.1 · requirements.md 13.3 (FR-AI-08).
 */
export function CacheHitCard({ stats }: { stats: CacheStatsDTO }) {
  const optimal = stats.hitRate >= 50;

  return (
    <Card tone="low" className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary" aria-hidden>
            bolt
          </span>
          <h3 className="font-headline-md text-on-surface">Prompt Cache</h3>
        </div>
        <Badge tone={optimal ? "primary" : "outline"}>{optimal ? "OPTIMAL" : "LOW"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-gutter">
        <Stat label="Cache hit rate" value={`${stats.hitRate}%`} hint="token đầu vào đọc từ cache" />
        <Stat label="Token tái sử dụng" value={stats.cacheReadTokens.toLocaleString("vi-VN")} hint="token đọc từ prefix cache" />
      </div>

      <div>
        <ProgressBar value={stats.hitRate} tone="secondary" />
        <p className="mt-space-sm text-body-sm text-on-surface-variant">
          {stats.totalCalls === 0
            ? "Chưa có lượt gọi AI nào — số liệu sẽ hiện sau khi bạn dùng AI."
            : `${stats.totalCalls} lượt gọi · ${stats.inputTokens.toLocaleString("vi-VN")} token đầu vào.`}
        </p>
      </div>
    </Card>
  );
}
