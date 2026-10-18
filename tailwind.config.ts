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
        primary: "#c3c0ff", // surface-tint light tint
        "primary-container": "#4f46e5", // actionable deep indigo
        "primary-hover": "#4338ca",
        "inverse-primary": "#4d44e3",
        secondary: "#bec6e0",
        "secondary-container": "#3f465c",
        tertiary: "#4edea3", // emerald (success)
        "tertiary-container": "#006e4b",
        success: "#10B981",
        warning: "#F59E0B",
        destructive: "#F43F5E", // rose
        neutral: "#94A3B8", // slate muted 400

        // Material 3 surface scale (dark-mode Fidelity)
        surface: "#051424",
        "surface-dim": "#051424",
        "surface-bright": "#2c3a4c",
        background: "#051424",
        "surface-container-lowest": "#010f1f",
        "surface-container-low": "#0d1c2d",
        "surface-container": "#122131",
        "surface-container-high": "#1c2b3c",
        "surface-container-highest": "#273647",
        "surface-variant": "#273647",

        // On-* tokens
        "on-surface": "#d4e4fa",
        "on-surface-variant": "#c7c4d8",
        "on-background": "#d4e4fa",
        "on-primary": "#1d00a5",
        "on-primary-container": "#dad7ff",
        "on-secondary": "#283044",
        "on-secondary-container": "#adb4ce",
        "on-tertiary": "#003824",
        "on-tertiary-container": "#67f4b7",
        "on-error": "#690005",
        "on-error-container": "#ffdad6",

        // Outline
        outline: "#918fa1",
        "outline-variant": "#464555",

        // Error
        error: "#ffb4ab",
        "error-container": "#93000a",

        // Custom surface scale (deprecated alias)
        "bg-canvas": "#090D16",
        "bg-surface-subtle": "#0F172A",
        "bg-surface-elevated": "#1E293B",
        "bg-surface-overlay": "#334155",
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
