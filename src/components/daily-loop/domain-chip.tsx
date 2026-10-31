import { cn } from "@/lib/cn";
import type { Domain } from "@/lib/prompts";

/**
 * Chip domain — nhãn tiếng Việt, màu theo domain (design-system §7.5).
 * KHÔNG hiển thị tên field thô (`professional`) cho người dùng (NFR-DL-05).
 */

const DOMAIN_LABELS: Record<Domain, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

const DOMAIN_CLASSES: Record<Domain, string> = {
  professional: "text-secondary",
  communication: "text-tertiary",
  language: "text-primary",
  personal: "text-tertiary-fixed-dim",
};

export interface DomainChipProps {
  domain: Domain;
  /** Hiện nhãn "Slot N · Chuyên môn" thay vì chỉ tên domain. */
  slot?: number;
  className?: string;
}

export function DomainChip({ domain, slot, className }: DomainChipProps) {
  const label = DOMAIN_LABELS[domain];
  const text = slot === undefined ? label : `Slot ${slot + 1} · ${label}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5",
        "font-label-sm text-label-sm uppercase tracking-wider",
        DOMAIN_CLASSES[domain],
        className,
      )}
    >
      {text}
    </span>
  );
}

export { DOMAIN_LABELS, DOMAIN_CLASSES };
