"use client";

import { Badge } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/Button";
import { DOMAIN_CHIP_CLASS } from "@/lib/ui";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";
import { relativeTime } from "@/lib/dates";
import { useRouter } from "next/navigation";

/**
 * `HistoryList` — lịch sử ghi nhanh (task 5.6).
 *
 * - Bộ lọc theo domain (chip row) → điều hướng bằng `searchParams` để URL
 *   chia sẻ được và filter chạy server-side (đơn giản + bền).
 * - Thanh phân bổ nỗ lực theo 4 domain (stacked bar) + badge tổng phút.
 * - Mỗi dòng: thời gian · tiêu đề · chip domain · phút · rating.
 * - **Dòng mới nhất ở trên cùng** (đã sort `createdAt desc` ở server).
 *
 * Xem tasks.md 5.6 · design.md §4.5.
 */

export type HistoryRow = {
  id: string;
  title: string;
  content: string | null;
  domain: Domain;
  type: string;
  minutes: number;
  skillName: string | null;
  rating: number | null;
  createdAt: string;
};

/** Thống kê phân bổ theo domain + tổng phút. */
export type HistoryStats = {
  totalMinutes: number;
  /** Số phút theo từng domain — dùng cho stacked bar. */
  byDomain: Record<Domain, number>;
  totalCount: number;
};

export function HistoryList({
  rows,
  stats,
  activeDomain,
}: {
  rows: HistoryRow[];
  stats: HistoryStats;
  /** Domain đang lọc — `null` = tất cả. */
  activeDomain: Domain | null;
}) {
  const router = useRouter();

  const setFilter = (domain: Domain | null) => {
    router.push(domain ? `/log/history?domain=${domain}` : "/log/history");
  };

  return (
    <div className="flex flex-col gap-gutter-md">
      {/* Bộ lọc domain — chip row */}
      <div className="flex flex-wrap gap-space-sm" role="group" aria-label="Lọc theo lĩnh vực">
        <FilterChip active={activeDomain === null} onClick={() => setFilter(null)}>
          Tất cả
        </FilterChip>
        {DOMAINS.map((d) => (
          <FilterChip
            key={d}
            active={activeDomain === d}
            onClick={() => setFilter(d)}
            className={DOMAIN_CHIP_CLASS[d]}
            testId={`filter-${d}`}
          >
            {DOMAIN_LABELS[d]}
          </FilterChip>
        ))}
      </div>

      {/* Thanh phân bổ nỗ lực + tổng phút */}
      <Card tone="low" className="flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-gutter">
          <span className="font-label-sm uppercase tracking-widest text-outline">
            Phân bổ nỗ lực theo lĩnh vực
          </span>
          <Badge tone="primary">{stats.totalMinutes} phút</Badge>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
          {DOMAINS.map((d) => {
            const minutes = stats.byDomain[d];
            if (!minutes || stats.totalMinutes === 0) return null;
            const pct = (minutes / stats.totalMinutes) * 100;
            return (
              <div
                key={d}
                className={barClass(d)}
                style={{ width: `${pct}%` }}
                title={`${DOMAIN_LABELS[d]}: ${minutes} phút`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-space-md">
          {DOMAINS.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant">
              <span className={`h-2 w-2 rounded-[9999px] ${dotClass(d)}`} aria-hidden />
              {DOMAIN_LABELS[d]} · {stats.byDomain[d]}′
            </span>
          ))}
        </div>

        <p className="text-body-sm text-on-surface-variant">
          {stats.totalCount} hoạt động đã ghi nhận.
        </p>
      </Card>

      {/* Danh sách — mới nhất ở trên */}
      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-space-md py-gutter-lg text-center">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: "2rem" }} aria-hidden>
            history
          </span>
          <p className="text-body-md text-on-surface-variant">
            {activeDomain
              ? `Chưa có hoạt động nào trong lĩnh vực ${DOMAIN_LABELS[activeDomain]}.`
              : "Chưa có hoạt động nào. Dùng nút “+ Ghi nhanh” ở trên để bắt đầu."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-space-md" data-testid="history-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Card tone="low" className="flex flex-col gap-space-sm" >
                <div className="flex flex-wrap items-start justify-between gap-gutter">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-label-md ${DOMAIN_CHIP_CLASS[row.domain]}`}
                      >
                        {DOMAIN_LABELS[row.domain]}
                      </span>
                      {row.rating ? (
                        <Badge tone={row.rating >= 3 ? "primary" : "outline"}>Đánh giá {row.rating}/4</Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-1 font-headline-sm text-on-surface">{row.title}</h3>
                    {row.content && row.content !== row.title ? (
                      <p className="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">
                        {row.content}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-body-sm text-on-surface-variant">
                    <span className="font-code-md text-on-surface">{row.minutes} phút</span>
                    <span>{relativeTime(new Date(row.createdAt))}</span>
                  </div>
                </div>

                {row.skillName ? (
                  <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
                      account_tree
                    </span>
                    {row.skillName}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  className,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 font-label-md transition-colors",
        active
          ? "border-primary bg-primary-container/20 text-primary"
          : "border-outline-variant/40 text-on-surface-variant hover:text-on-surface",
        // Chip domain tô màu theo lĩnh vực — nhưng trạng thái active vẫn nổi bật.
        active && className,
      )}
    >
      {children}
    </button>
  );
}

/** Màu thanh phân bổ — dùng token Tailwind, không hex hardcode. */
function barClass(domain: Domain): string {
  switch (domain) {
    case "professional":
      return "bg-primary";
    case "communication":
      return "bg-outline";
    case "language":
      return "bg-secondary";
    default:
      return "bg-tertiary";
  }
}

function dotClass(domain: Domain): string {
  return barClass(domain);
}
