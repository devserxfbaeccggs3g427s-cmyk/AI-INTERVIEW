/**
 * Mapping màu theo domain — nguồn duy nhất cho chip domain ở S01/S02/S05/S03.
 *
 * Quy tắc design.md §3.2: mỗi màn hình không dùng quá 3 màu nhấn, `secondary`
 * (tím) dành riêng cho AI, `tertiary` (cam) dành cho streak / retention.
 */
import type { Domain } from "@/lib/types";

export type DomainTone = "primary" | "secondary" | "tertiary" | "outline";

export const DOMAIN_TONE: Record<Domain, DomainTone> = {
  professional: "primary",
  communication: "outline",
  language: "secondary",
  personal: "tertiary",
};

/** Class Tailwind cho chip domain — dùng token, không hex hardcode. */
export const DOMAIN_CHIP_CLASS: Record<Domain, string> = {
  professional: "bg-primary-container/20 border-primary/30 text-primary",
  communication: "bg-surface-container-high border-outline-variant/40 text-on-surface-variant",
  language: "bg-secondary-container/40 border-secondary/25 text-secondary",
  personal: "bg-tertiary-container/20 border-tertiary/30 text-tertiary",
};

/** Rail màu bên trái cho slot ưu tiên ở S01. */
export const DOMAIN_RAIL_CLASS: Record<Domain, string> = {
  professional: "bg-primary",
  communication: "bg-outline",
  language: "bg-secondary",
  personal: "bg-tertiary",
};
