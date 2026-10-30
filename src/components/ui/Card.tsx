// `cn` import từ `@/lib/cn` (module KHÔNG có "use client") để `Card` vẫn dùng
// được trong Server Component. Import từ `@/components/ui/Button` sẽ biến
// `cn` thành client-reference và ném lỗi "Attempted to call cn() from the server".
import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Mức nền — `low` dùng cho card lồng trong card. */
  tone?: "base" | "low" | "high";
  padded?: boolean;
};

const TONES = {
  base: "bg-surface-container border border-outline-variant/30",
  low: "bg-surface-container-low border border-outline-variant/25",
  high: "bg-surface-container-high border border-outline-variant/35",
} as const;

export function Card({
  tone = "base",
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn("rounded-xl", TONES[tone], padded && "p-gutter", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-gutter mb-gutter", className)}>
      <div className="flex items-center gap-space-md min-w-0">
        {icon ? (
          <span className="material-symbols-outlined text-primary shrink-0" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="font-headline-md text-on-surface truncate">{title}</h3>
          {subtitle ? (
            <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Nhãn mono uppercase — micro-label theo design.md §3.3. */
export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-label-sm uppercase tracking-widest text-outline",
        className,
      )}
    >
      {children}
    </span>
  );
}
