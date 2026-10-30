"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

// `cn` nằm trong module client (`"use client"`) nên **không** gọi được từ
// Server Component. Nguồn thật đặt ở `@/lib/cn` (không directive) và được
// re-export ở đây để các import site cũ không phải sửa.
// Xem tasks.md 3.6 · design.md §2.3.
export { cn };

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ai" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-container text-on-primary hover:brightness-105 active:scale-[0.98] font-semibold",
  secondary:
    "bg-secondary-container text-on-secondary-container hover:brightness-110 active:scale-[0.98]",
  ghost:
    "bg-transparent border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
  ai: "bg-secondary-container/40 text-secondary border border-secondary/30 hover:bg-secondary-container/60",
  danger: "bg-error-container text-on-error-container hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-label-md gap-1.5",
  md: "h-10 px-4 text-body-md gap-2",
  lg: "h-12 px-6 text-body-lg gap-2",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "ghost",
    size = "md",
    loading = false,
    icon,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-all",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="material-symbols-outlined animate-spin"
          style={{ fontSize: "1.125rem" }}
          aria-hidden
        >
          progress_activity
        </span>
      ) : icon ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: size === "sm" ? "1rem" : "1.125rem" }}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});
