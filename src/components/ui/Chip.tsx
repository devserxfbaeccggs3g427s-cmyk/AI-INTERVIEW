// `cn` import từ `@/lib/cn` (module KHÔNG có "use client") để `Chip` vẫn dùng
// được trong Server Component. Import từ `@/components/ui/Button` sẽ biến
// `cn` thành client-reference và ném lỗi "Attempted to call cn() from the server".
import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "tertiary"
  | "error"
  | "outline";

const TONES = {
  neutral: "bg-surface-container-low border-outline-variant/30 text-on-surface-variant",
  primary: "bg-primary-container/20 border-primary/30 text-primary",
  secondary: "bg-secondary-container/40 border-secondary/25 text-secondary",
  tertiary: "bg-tertiary-container/20 border-tertiary/30 text-tertiary",
  error: "bg-error-container/30 border-error/30 text-error",
  outline: "bg-transparent border-outline-variant/40 text-outline",
} as const;

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  icon?: string;
};

export function Chip({ tone = "neutral", icon, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 font-label-md border",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

const BADGE_TONES = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  tertiary: "bg-tertiary text-on-tertiary",
  error: "bg-error-container text-on-error-container",
  outline: "bg-surface-container-highest text-outline",
} as const;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof BADGE_TONES;
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-label-sm",
        BADGE_TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Dot trạng thái nhỏ — dùng cho hàng trạng thái DB ở sidebar. */
export function StatusDot({
  tone = "primary",
  pulse = false,
  className,
}: {
  tone?: "primary" | "tertiary" | "error" | "outline";
  pulse?: boolean;
  className?: string;
}) {
  const colors = {
    primary: "bg-primary",
    tertiary: "bg-tertiary",
    error: "bg-error",
    outline: "bg-outline",
  } as const;

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-[9999px]",
        colors[tone],
        pulse && "animate-pulse",
        className,
      )}
      aria-hidden
    />
  );
}

/** Thanh tiến trình dạng segment — mỗi segment = 1 level (S03). */
export function ProgressSegments({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}) {
  const segments = Array.from({ length: total }, (_, i) => i);
  return (
    <div className={cn("flex gap-0.5", className)} aria-hidden>
      {segments.map((i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-sm",
            i < current ? "bg-primary" : "bg-surface-container-highest",
          )}
        />
      ))}
    </div>
  );
}

/** Thanh tiến trình liên tục — dùng cho % tiến trình level ở FocusNodeCard. */
export function ProgressBar({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "secondary" | "tertiary";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fills = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    tertiary: "bg-tertiary",
  } as const;

  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all", fills[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Nội dung dạng "chỉ số + nhãn" — dùng cho KPI grid ở S03/S04. */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-on-surface-variant">
        {icon ? (
          <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="font-label-sm uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 font-headline-md text-on-surface">{value}</div>
      {hint ? <div className="text-body-sm text-on-surface-variant">{hint}</div> : null}
    </div>
  );
}
