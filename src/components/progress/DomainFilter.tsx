"use client";

import { cn } from "@/components/ui/Button";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";

/**
 * `DomainFilter` — chip lọc 4 domain + "Tất cả" (task 16.6).
 *
 * Một hàng filter **ở trên mọi thứ nó chi phối** — không đặt filter riêng
 * trong từng card biểu đồ. Đổi domain → lọc **cả** quỹ đạo, heatmap và
 * phân bổ thời gian cùng lúc (state nâng lên ở view cha).
 *
 * Xem tasks.md 16.6 · requirements.md AC 12.10.
 */

export type DomainFilterValue = Domain | null;

export function DomainFilter({
  value,
  onChange,
  className,
}: {
  /** Domain đang chọn — `null` = tất cả. */
  value: DomainFilterValue;
  /** Callback khi đổi domain. */
  onChange: (value: DomainFilterValue) => void;
  className?: string;
}) {
  const options: Array<{ value: DomainFilterValue; label: string }> = [
    { value: null, label: "Tất cả domain" },
    ...DOMAINS.map((d) => ({ value: d as DomainFilterValue, label: DOMAIN_LABELS[d] })),
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 rounded-lg bg-surface-container-low p-1",
        className,
      )}
      role="group"
      aria-label="Lọc theo domain"
      data-testid="domain-filter"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value ?? "all"}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            data-testid={`domain-filter-${option.value ?? "all"}`}
            className={cn(
              "rounded px-space-md py-1.5 font-label-md transition-colors",
              active
                ? "bg-surface-container-high font-semibold text-on-surface"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
