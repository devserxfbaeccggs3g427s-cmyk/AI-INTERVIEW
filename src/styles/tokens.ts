/**
 * Design tokens — Focus Flow.
 *
 * Nguồn sự thật: `stitch_daily_loop_os/focus_flow/DESIGN.md` (YAML frontmatter).
 * File này là bản **mirror** của khối `@theme` trong `src/app/globals.css`,
 * dùng cho:
 *   - test `tokens.test.ts` (NFR-10 — không màu hex hardcode ngoài palette)
 *   - component cần giá trị số (chart, sparkline, inline style)
 *
 * Quyết định mapping: `.kiro/specs/daily-loop-os/design.md` §3.1.
 * ⚠️ `radius.full` = "0.75rem" — KHÔNG phải 9999px (đã verify bằng pixel trên
 * s01/screen.png: avatar header là squircle, không phải hình tròn).
 */

/** Bảng màu — lấy nguyên văn từ DESIGN.md `colors:` */
export const PALETTE = {
  surface: "#0f131c",
  "surface-dim": "#0f131c",
  "surface-bright": "#353943",
  "surface-container-lowest": "#0a0e17",
  "surface-container-low": "#181b25",
  "surface-container": "#1c1f29",
  "surface-container-high": "#262a34",
  "surface-container-highest": "#31353f",
  "on-surface": "#dfe2ef",
  "on-surface-variant": "#bbcabf",
  "inverse-surface": "#dfe2ef",
  "inverse-on-surface": "#2c303a",
  outline: "#86948a",
  "outline-variant": "#3c4a42",
  "surface-tint": "#4edea3",
  primary: "#4edea3",
  "on-primary": "#003824",
  "primary-container": "#10b981",
  "on-primary-container": "#00422b",
  "inverse-primary": "#006c49",
  secondary: "#c0c1ff",
  "on-secondary": "#1000a9",
  "secondary-container": "#3131c0",
  "on-secondary-container": "#b0b2ff",
  tertiary: "#ffb95f",
  "on-tertiary": "#472a00",
  "tertiary-container": "#e29100",
  "on-tertiary-container": "#523200",
  error: "#ffb4ab",
  "on-error": "#690005",
  "error-container": "#93000a",
  "on-error-container": "#ffdad6",
  "primary-fixed": "#6ffbbe",
  "primary-fixed-dim": "#4edea3",
  "on-primary-fixed": "#002113",
  "on-primary-fixed-variant": "#005236",
  "secondary-fixed": "#e1e0ff",
  "secondary-fixed-dim": "#c0c1ff",
  "on-secondary-fixed": "#07006c",
  "on-secondary-fixed-variant": "#2f2ebe",
  "tertiary-fixed": "#ffddb8",
  "tertiary-fixed-dim": "#ffb95f",
  "on-tertiary-fixed": "#2a1700",
  "on-tertiary-fixed-variant": "#653e00",
  background: "#0f131c",
  "on-background": "#dfe2ef",
  "surface-variant": "#31353f",
} as const;

/**
 * Border radius — theo quyết định §3.1.
 * `full` = 0.75rem (12px), KHÔNG phải 9999px.
 */
export const RADIUS = {
  DEFAULT: "0.125rem",
  sm: "0.125rem",
  md: "0.375rem",
  lg: "0.25rem",
  xl: "0.5rem",
  full: "0.75rem",
} as const;

/** Class Tailwind dùng để làm hình tròn THẬT (vì `rounded-full` = 12px). */
export const ROUND_CIRCLE = "rounded-[9999px]";

/** Typography scale — font-family + size + weight + line-height + tracking */
export type TypographyToken = {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
};

export const TYPOGRAPHY = {
  display: {
    fontFamily: "Space Grotesk",
    fontSize: "3.5rem",
    fontWeight: "700",
    lineHeight: "4rem",
    letterSpacing: "-0.03em",
  },
  "headline-lg": {
    fontFamily: "Space Grotesk",
    fontSize: "2.25rem",
    fontWeight: "600",
    lineHeight: "2.75rem",
    letterSpacing: "-0.025em",
  },
  "headline-lg-mobile": {
    fontFamily: "Space Grotesk",
    fontSize: "1.75rem",
    fontWeight: "600",
    lineHeight: "2.25rem",
    letterSpacing: "-0.02em",
  },
  "headline-md": {
    fontFamily: "Space Grotesk",
    fontSize: "1.5rem",
    fontWeight: "600",
    lineHeight: "2rem",
    letterSpacing: "-0.02em",
  },
  "headline-sm": {
    fontFamily: "Space Grotesk",
    fontSize: "1.25rem",
    fontWeight: "500",
    lineHeight: "1.75rem",
    letterSpacing: "-0.015em",
  },
  "body-lg": {
    fontFamily: "Be Vietnam Pro",
    fontSize: "1.125rem",
    fontWeight: "400",
    lineHeight: "1.875rem",
    letterSpacing: "0em",
  },
  "body-md": {
    fontFamily: "Be Vietnam Pro",
    fontSize: "0.9375rem",
    fontWeight: "400",
    lineHeight: "1.625rem",
    letterSpacing: "0em",
  },
  "body-sm": {
    fontFamily: "Be Vietnam Pro",
    fontSize: "0.8125rem",
    fontWeight: "400",
    lineHeight: "1.375rem",
    letterSpacing: "0.005em",
  },
  "code-md": {
    fontFamily: "JetBrains Mono",
    fontSize: "0.875rem",
    fontWeight: "500",
    lineHeight: "1.5rem",
    letterSpacing: "-0.01em",
  },
  "label-md": {
    fontFamily: "JetBrains Mono",
    fontSize: "0.75rem",
    fontWeight: "500",
    lineHeight: "1rem",
    letterSpacing: "0.04em",
  },
  "label-sm": {
    fontFamily: "JetBrains Mono",
    fontSize: "0.6875rem",
    fontWeight: "600",
    lineHeight: "0.875rem",
    letterSpacing: "0.06em",
  },
} as const satisfies Record<string, TypographyToken>;

/** Spacing scale — baseline 4px */
export const SPACING = {
  gutter: "1rem",
  "gutter-md": "1.25rem",
  "gutter-lg": "1.5rem",
  margin: "1rem",
  "margin-md": "1.5rem",
  "margin-lg": "2.5rem",
  "space-xs": "0.25rem",
  "space-sm": "0.5rem",
  "space-md": "0.75rem",
  "space-lg": "1.25rem",
  "space-xl": "2rem",
} as const;

/**
 * Ngữ nghĩa màu — ánh xạ vai trò UI → token.
 * Nguồn: design.md §3.2.
 */
export const COLOR_ROLES = {
  pageBackground: "background",
  card: "surface-container",
  cardLow: "surface-container-low",
  cardHigh: "surface-container-high",
  border: "outline-variant",
  textPrimary: "on-surface",
  textSecondary: "on-surface-variant",
  label: "outline",
  actionBg: "primary",
  actionText: "on-primary",
  ctaBg: "primary-container",
  streak: "tertiary",
  aiAccent: "secondary",
  error: "error",
  success: "primary",
  warning: "tertiary-container",
} as const;

export type ColorRole = keyof typeof COLOR_ROLES;

/** Tra cứu nhanh giá trị hex của một token màu. */
export function color(token: string): string {
  const value = (PALETTE as Record<string, string>)[token];
  if (!value) {
    throw new Error(`Unknown color token: ${token}`);
  }
  return value;
}

/** Tra cứu nhanh giá trị hex theo vai trò ngữ nghĩa. */
export function roleColor(role: ColorRole): string {
  return color(COLOR_ROLES[role]);
}
