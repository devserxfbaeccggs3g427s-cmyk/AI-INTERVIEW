import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const globalsCss = readFileSync(
  fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  "utf8",
);

/**
 * FR-AF-07..11 — Design token từ design-system.md §2–§6.
 * FR-AF-10 — 3 font qua next/font.
 * FR-AF-06 — Không có tailwind.config.js (Tailwind v4 CSS-first).
 * AC-AF-3 — Token đúng design system.
 */
describe("FR-AF-07..11 — globals.css design token khớp design-system.md", () => {
  it("khai báo đủ token màu (design-system §2)", () => {
    const REQUIRED_COLOR_TOKENS = [
      "surface",
      "surface-dim",
      "surface-container-lowest",
      "surface-container-low",
      "surface-container",
      "surface-container-high",
      "surface-container-highest",
      "surface-variant",
      "surface-bright",
      "on-surface",
      "on-surface-variant",
      "outline",
      "outline-variant",
      "primary",
      "primary-container",
      "on-primary",
      "secondary",
      "secondary-container",
      "on-secondary",
      "tertiary",
      "tertiary-container",
      "on-tertiary",
      "error",
      "error-container",
      "on-error",
      "background",
      "on-background",
      "inverse-surface",
      "inverse-on-surface",
      "surface-tint",
      "primary-fixed",
      "primary-fixed-dim",
      "on-primary-fixed",
      "on-primary-fixed-variant",
      "secondary-fixed",
      "secondary-fixed-dim",
      "on-secondary-fixed",
      "on-secondary-fixed-variant",
      "tertiary-fixed",
      "tertiary-fixed-dim",
      "on-tertiary-fixed",
      "on-tertiary-fixed-variant",
      "inverse-primary",
    ];

    for (const token of REQUIRED_COLOR_TOKENS) {
      expect(globalsCss).toContain(`--color-${token}:`);
    }
  });

  it("màu surface = #0f131c, primary = #4edea3, secondary = #c0c1ff, tertiary = #ffb95f", () => {
    expect(globalsCss).toContain("--color-surface: #0f131c;");
    expect(globalsCss).toContain("--color-primary: #4edea3;");
    expect(globalsCss).toContain("--color-primary-container: #10b981;");
    expect(globalsCss).toContain("--color-secondary: #c0c1ff;");
    expect(globalsCss).toContain("--color-tertiary: #ffb95f;");
  });

  it("dark mode mặc định duy nhất (color-scheme: dark)", () => {
    expect(globalsCss).toContain("color-scheme: dark");
  });

  it("khai báo 11 token typography (design-system §3)", () => {
    const REQUIRED_TYPE_TOKENS = [
      "display",
      "headline-lg",
      "headline-lg-mobile",
      "headline-md",
      "headline-sm",
      "body-lg",
      "body-md",
      "body-sm",
      "label-md",
      "label-sm",
      "code-md",
    ];

    for (const token of REQUIRED_TYPE_TOKENS) {
      expect(globalsCss).toContain(`--font-${token}:`);
      expect(globalsCss).toContain(`--text-${token}:`);
    }
  });

  it("mọi token typography có line-height và letter-spacing", () => {
    const REQUIRED_TYPE_TOKENS = [
      "display",
      "headline-lg",
      "headline-lg-mobile",
      "headline-md",
      "headline-sm",
      "body-lg",
      "body-md",
      "body-sm",
      "label-md",
      "label-sm",
      "code-md",
    ];

    for (const token of REQUIRED_TYPE_TOKENS) {
      expect(globalsCss).toContain(`--text-${token}--line-height:`);
      expect(globalsCss).toContain(`--text-${token}--letter-spacing:`);
    }
  });

  it("khai báo token spacing (bội số 0.25rem)", () => {
    for (const token of [
      "space-xs",
      "space-sm",
      "space-md",
      "space-lg",
      "space-xl",
      "gutter",
      "gutter-md",
      "gutter-lg",
      "margin",
      "margin-md",
      "margin-lg",
    ]) {
      expect(globalsCss).toContain(`--spacing-${token}:`);
    }
  });

  it("khai báo token radius + shadow (không shadow-xl)", () => {
    for (const token of ["sm", "DEFAULT", "md", "lg", "xl", "full"]) {
      expect(globalsCss).toContain(`--radius-${token}:`);
    }
    expect(globalsCss).toContain("--shadow-md:");
    expect(globalsCss).toContain("--shadow-sm:");
    // design-system §10 — KHÔNG shadow-xl.
    expect(globalsCss).not.toContain("--shadow-xl");
  });

  it("body dùng font Be Vietnam Pro + nền surface", () => {
    expect(globalsCss).toContain("background-color: var(--color-surface);");
    expect(globalsCss).toContain("var(--font-be-vietnam-pro)");
  });

  it("KHÔNG dùng tailwind.config.js (Tailwind v4 CSS-first)", async () => {
    const { existsSync } = await import("node:fs");
    const root = fileURLToPath(new URL("..", import.meta.url));
    expect(existsSync(`${root}tailwind.config.js`)).toBe(false);
    expect(existsSync(`${root}tailwind.config.ts`)).toBe(false);
  });

  it("globals.css import tailwindcss", () => {
    expect(globalsCss).toContain('@import "tailwindcss"');
  });
});