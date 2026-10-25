import type { Config } from "tailwindcss";

/**
 * Maps every AI Mock Interview Studio token (colors, spacing, radius,
 * typography) to Tailwind utilities so the entire app stays on-brand from
 * globals.css. Reference: stitch-screens/01-design-system.md § 8.
 *
 * Spacing scale (8px rhythm with 4px sub-increments):
 *   xs=4  sm=8  md=16  lg=24  xl=40  gutter=20  margin=32
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette (per design-system § 2 & § 8)
        primary: "rgb(var(--tw-primary) / <alpha-value>)", // readable accent, distinct from the solid button --primary
        "primary-container": "rgb(var(--tw-primary-container) / <alpha-value>)",
        "primary-hover": "rgb(var(--tw-primary-hover) / <alpha-value>)",
        "inverse-primary": "rgb(var(--tw-inverse-primary) / <alpha-value>)",
        secondary: "rgb(var(--tw-secondary) / <alpha-value>)",
        "secondary-container": "rgb(var(--tw-secondary-container) / <alpha-value>)",
        tertiary: "rgb(var(--tw-tertiary) / <alpha-value>)",
        "tertiary-container": "rgb(var(--tw-tertiary-container) / <alpha-value>)",
        success: "rgb(var(--tw-success) / <alpha-value>)",
        warning: "rgb(var(--tw-warning) / <alpha-value>)",
        destructive: "rgb(var(--tw-destructive) / <alpha-value>)",
        neutral: "rgb(var(--tw-neutral) / <alpha-value>)",

        // Material 3 surface scale (dark-mode Fidelity)
        surface: "rgb(var(--tw-surface) / <alpha-value>)",
        "surface-dim": "rgb(var(--tw-surface-dim) / <alpha-value>)",
        "surface-bright": "rgb(var(--tw-surface-bright) / <alpha-value>)",
        background: "rgb(var(--tw-background) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--tw-surface-container-lowest) / <alpha-value>)",
        "surface-container-low": "rgb(var(--tw-surface-container-low) / <alpha-value>)",
        "surface-container": "rgb(var(--tw-surface-container) / <alpha-value>)",
        "surface-container-high": "rgb(var(--tw-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--tw-surface-container-highest) / <alpha-value>)",
        "surface-variant": "rgb(var(--tw-surface-variant) / <alpha-value>)",

        // On-* tokens
        "on-surface": "rgb(var(--tw-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--tw-on-surface-variant) / <alpha-value>)",
        "on-background": "rgb(var(--tw-on-background) / <alpha-value>)",
        "on-primary": "rgb(var(--tw-on-primary) / <alpha-value>)",
        "on-primary-container": "rgb(var(--tw-on-primary-container) / <alpha-value>)",
        "on-secondary": "rgb(var(--tw-on-secondary) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--tw-on-secondary-container) / <alpha-value>)",
        "on-tertiary": "rgb(var(--tw-on-tertiary) / <alpha-value>)",
        "on-tertiary-container": "rgb(var(--tw-on-tertiary-container) / <alpha-value>)",
        "on-error": "rgb(var(--tw-on-error) / <alpha-value>)",
        "on-error-container": "rgb(var(--tw-on-error-container) / <alpha-value>)",

        // Outline
        outline: "rgb(var(--tw-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--tw-outline-variant) / <alpha-value>)",

        // Error
        error: "rgb(var(--tw-error) / <alpha-value>)",
        "error-container": "rgb(var(--tw-error-container) / <alpha-value>)",

        // Custom surface scale (deprecated alias)
        "bg-canvas": "rgb(var(--tw-bg-canvas) / <alpha-value>)",
        "bg-surface-subtle": "rgb(var(--tw-bg-surface-subtle) / <alpha-value>)",
        "bg-surface-elevated": "rgb(var(--tw-bg-surface-elevated) / <alpha-value>)",
        "bg-surface-overlay": "rgb(var(--tw-bg-surface-overlay) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "0.5rem", // design system base
        sm: "0.25rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      spacing: {
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2.5rem",
        gutter: "1.25rem",
        "gutter-mobile": "0.75rem",
        margin: "2rem",
        "margin-mobile": "1rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        // Backwards-compatible aliases used in the Stitch HTML
        "label-caps": ["var(--font-mono)", "ui-monospace", "monospace"],
        "label-code-lg": ["var(--font-mono)", "ui-monospace", "monospace"],
        "label-code-sm": ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        "headline-lg": ["var(--font-sans)", "system-ui", "sans-serif"],
        "headline-md": ["var(--font-sans)", "system-ui", "sans-serif"],
        "headline-sm": ["var(--font-sans)", "system-ui", "sans-serif"],
        "headline-lg-mobile": ["var(--font-sans)", "system-ui", "sans-serif"],
        "body-lg": ["var(--font-sans)", "system-ui", "sans-serif"],
        "body-md": ["var(--font-sans)", "system-ui", "sans-serif"],
        "body-sm": ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-lg-mobile": ["26px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "500" }],
        "headline-sm": ["18px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        "label-caps": ["10px", { lineHeight: "14px", letterSpacing: "0.08em", fontWeight: "600" }],
        "label-code-lg": ["14px", { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "label-code-sm": ["12px", { lineHeight: "16px", letterSpacing: "0em", fontWeight: "400" }],
      },
      boxShadow: {
        "inset-light": "inset 0 1px 0 rgba(255,255,255,0.18)",
        hairline: "0 1px 0 0 rgba(148,163,184,0.08)",
        glow: "0 0 0 1px rgba(79,70,229,0.4), 0 0 24px -4px rgba(79,70,229,0.15)",
      },
      backgroundImage: {
        "primary-fade": "linear-gradient(to right, #4f46e5, #4edea3)",
      },
    },
  },
  plugins: [],
};

export default config;
