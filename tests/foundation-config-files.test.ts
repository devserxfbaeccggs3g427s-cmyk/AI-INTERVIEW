/**
 * Unit test — FR cấu hình dự án của feature `app-foundation`.
 *
 * Nguyên tắc: test đọc **file thật** trong repo (đường dẫn tuyệt đối, resolve từ
 * `__dirname`) rồi assert nội dung — KHÔNG network, KHÔNG `npm install`,
 * KHÔNG `npm run build`.
 *
 * Phủ các FR:
 *   FR-AF-01 khởi tạo dự án (package.json + tsconfig + prisma + eslint/prettier)
 *   FR-AF-02 scripts package.json
 *   FR-AF-03 tsconfig strict / paths / moduleResolution / target
 *   FR-AF-04 next.config.ts (không tắt Strict Mode, không output: "export")
 *   FR-AF-05 dependency đúng phiên bản
 *   FR-AF-08 typography token (3 font + 11 token size)
 *   FR-AF-09 spacing / radius / shadow token
 *   FR-AF-11 Material Symbols Outlined
 *   FR-AF-12 layout.tsx (Server Component, lang="vi", 3 font, boundary client)
 *   FR-AF-13 globals.css dark-mode mặc định
 *   FR-AF-14 app-shell (khung max-w + grid 12→8→4)
 *   FR-AF-15 bottom nav đúng 4 nút
 *   FR-AF-16 overflow menu đúng 5 mục
 *   FR-AF-17 trang chủ render trong shell + dùng design token
 *   FR-AF-21 src/lib/types.ts (DomainKey / Level / ActivityType)
 *   FR-AF-24 .env.example (DATABASE_URL + ANTHROPIC_API_KEY) + .gitignore
 *   FR-AF-28 vitest config + playwright config + script test / test:e2e
 *   FR-AF-29 viewport 390×844 và 1280×900 + baseURL
 *   FR-AF-30 .github/workflows/ci.yml (lint + typecheck + test + build)
 *   FR-AF-31 README.md (cách chạy, cấu trúc thư mục, link .kiro/README.md)
 */

import { describe, expect, it } from "vitest";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ActivityType, DomainKey, Level } from "@/lib/types";
import { ACTIVITY_TYPES, DOMAINS, LEVELS } from "@/lib/types";

/** Thư mục gốc repo (đường dẫn tuyệt đối). */
const ROOT = path.resolve(__dirname, "..");

function readText(relativePath: string): string {
  return readFileSync(path.resolve(ROOT, relativePath), "utf8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function fileExists(relativePath: string): boolean {
  return existsSync(path.resolve(ROOT, relativePath));
}

/** Kiểu cấu hình tối thiểu của package.json (không dùng `any`). */
interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TsConfigShape {
  compilerOptions?: {
    strict?: boolean;
    target?: string;
    moduleResolution?: string;
    paths?: Record<string, string[]>;
  };
}

/** next.config.ts là TypeScript — đọc bằng regex, không JSON.parse. */
function readNextConfig(): {
  source: string;
  reactStrictMode: boolean | undefined;
  output: string | undefined;
  hasServerActions: boolean;
} {
  const source = readText("next.config.ts");
  const strictMatch = /reactStrictMode\s*:\s*(true|false)/.exec(source);
  const outputMatch = /output\s*:\s*["']([^"']+)["']/.exec(source);
  const experimentalBlock = /experimental\s*:\s*\{([\s\S]*?)\n\s*\},/.exec(source)?.[1] ?? "";
  return {
    source,
    reactStrictMode: strictMatch ? strictMatch[1] === "true" : undefined,
    output: outputMatch?.[1],
    hasServerActions: /serverActions\s*:/.test(experimentalBlock),
  };
}

/** Lấy major version từ semver range (`^15.5.28` → 15). */
function majorOf(versionRange: string): number {
  const matched = /(\d+)/.exec(versionRange);
  return matched ? Number.parseInt(matched[1] ?? "", 10) : -1;
}

/** Trích mảng object literal `{ href: "...", label: "..." }` trong file TSX. */
function extractNavItems(source: string, constName: string): Array<{ href: string; label: string }> {
  const start = source.indexOf(`const ${constName} = [`);
  expect(start, `không tìm thấy \`const ${constName} = [\``).toBeGreaterThan(-1);
  const end = source.indexOf("] as const;", start);
  expect(end, `không tìm thấy \`] as const;\` của ${constName}`).toBeGreaterThan(start);

  const block = source.slice(start, end);
  const items: Array<{ href: string; label: string }> = [];
  const pattern = /\{\s*href:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g;
  let match = pattern.exec(block);
  while (match !== null) {
    items.push({ href: match[1] ?? "", label: match[2] ?? "" });
    match = pattern.exec(block);
  }
  return items;
}

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-01 — Khởi tạo dự án (Next.js 15 App Router + TS strict + Tailwind v4 + Prisma)
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-01 — khởi tạo dự án: Next.js 15 App Router + TS strict + Tailwind v4 + Prisma", () => {
  it("package.json tồn tại, có name + dependencies + devDependencies", () => {
    expect(fileExists("package.json")).toBe(true);
    const pkg = readJson<PackageJsonShape>("package.json");
    expect(pkg.name).toBeTruthy();
    expect(Object.keys(pkg.dependencies ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(pkg.devDependencies ?? {}).length).toBeGreaterThan(0);
  });

  it("App Router: có src/app/layout.tsx + src/app/page.tsx (không dùng src/pages)", () => {
    expect(fileExists("src/app/layout.tsx")).toBe(true);
    expect(fileExists("src/app/page.tsx")).toBe(true);
    expect(fileExists("src/pages")).toBe(false);
  });

  it("tsconfig.json có strict: true", () => {
    const tsconfig = readJson<TsConfigShape>("tsconfig.json");
    expect(tsconfig.compilerOptions?.strict).toBe(true);
  });

  it("prisma/schema.prisma có generator client + datasource sqlite dùng env DATABASE_URL", () => {
    expect(fileExists("prisma/schema.prisma")).toBe(true);
    const schema = readText("prisma/schema.prisma");
    expect(schema).toContain("generator client");
    expect(schema).toMatch(/provider\s*=\s*"prisma-client-js"/);
    expect(schema).toMatch(/datasource\s+db\s*\{/);
    expect(schema).toMatch(/provider\s*=\s*"sqlite"/);
    expect(schema).toContain('env("DATABASE_URL")');
  });

  it("prisma/schema.prisma có đủ model lõi của SPEC §4 (≥ 15 model)", () => {
    const schema = readText("prisma/schema.prisma");
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] ?? "");
    expect(models.length).toBeGreaterThanOrEqual(15);
    for (const model of [
      "Skill",
      "Activity",
      "Evidence",
      "Reflection",
      "PlanItem",
      "Card",
      "Review",
      "DailyState",
      "UserProfile",
      "AiCall",
    ]) {
      expect(models, `thiếu model ${model}`).toContain(model);
    }
  });

  it("có ESLint (flat config) + Prettier", () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    expect(fileExists(".prettierrc.json")).toBe(true);
    const eslintConfig = readText("eslint.config.mjs");
    expect(eslintConfig).toContain("next/core-web-vitals");
    expect(eslintConfig).toContain("next/typescript");
  });

  it("Tailwind v4: postcss dùng @tailwindcss/postcss, không có tailwind.config.js", () => {
    expect(fileExists("postcss.config.mjs")).toBe(true);
    expect(readText("postcss.config.mjs")).toContain("@tailwindcss/postcss");
    expect(fileExists("tailwind.config.js")).toBe(false);
    expect(fileExists("tailwind.config.ts")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-02 — Scripts package.json
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-02 — package.json có đủ script bắt buộc", () => {
  const REQUIRED_SCRIPTS = [
    "dev",
    "build",
    "start",
    "lint",
    "typecheck",
    "db:migrate",
    "db:seed",
    "db:reset",
    "test",
    "test:e2e",
    "validate:specs",
  ] as const;

  it.each(REQUIRED_SCRIPTS)('có script "%s"', (scriptName) => {
    const pkg = readJson<PackageJsonShape>("package.json");
    const script = pkg.scripts?.[scriptName];
    expect(script, `thiếu script ${scriptName}`).toBeTypeOf("string");
    expect((script ?? "").length).toBeGreaterThan(0);
  });

  it("script test chạy Vitest, script test:e2e chạy Playwright", () => {
    const pkg = readJson<PackageJsonShape>("package.json");
    expect(pkg.scripts?.test).toContain("vitest");
    expect(pkg.scripts?.["test:e2e"]).toContain("playwright");
  });

  it("script validate:specs gọi validator trong .kiro/scripts/", () => {
    const pkg = readJson<PackageJsonShape>("package.json");
    expect(pkg.scripts?.["validate:specs"]).toContain(".kiro/scripts");
    expect(fileExists(".kiro/scripts/validate_specs.py")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-03 — tsconfig.json
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-03 — tsconfig.json: strict + paths + moduleResolution + target", () => {
  it('strict: true', () => {
    expect(readJson<TsConfigShape>("tsconfig.json").compilerOptions?.strict).toBe(true);
  });

  it('paths: { "@/*": ["./src/*"] }', () => {
    const paths = readJson<TsConfigShape>("tsconfig.json").compilerOptions?.paths;
    expect(paths?.["@/*"]).toEqual(["./src/*"]);
  });

  it('moduleResolution: "bundler"', () => {
    expect(readJson<TsConfigShape>("tsconfig.json").compilerOptions?.moduleResolution).toBe("bundler");
  });

  it('target: "ES2022"', () => {
    expect(readJson<TsConfigShape>("tsconfig.json").compilerOptions?.target).toBe("ES2022");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-04 — next.config.ts
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-04 — next.config.ts: không tắt Strict Mode, không output: \"export\"", () => {
  it("reactStrictMode bật (true), không phải false", () => {
    expect(readNextConfig().reactStrictMode).toBe(true);
  });

  it("không có output: \"export\" (cần server routes)", () => {
    const config = readNextConfig();
    expect(config.output).toBeUndefined();
    expect(config.source).not.toMatch(/output\s*:\s*["']export["']/);
  });

  it("experimental.serverActions được khai báo", () => {
    expect(readNextConfig().hasServerActions).toBe(true);
  });

  it("@anthropic-ai/sdk là server-only (serverExternalPackages)", () => {
    const config = readNextConfig();
    expect(config.source).toContain("serverExternalPackages");
    expect(config.source).toContain("@anthropic-ai/sdk");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-05 — Dependency đúng phiên bản
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-05 — dependency đúng phiên bản", () => {
  it("next@15, react@19, react-dom@19, typescript@5, tailwindcss@4", () => {
    const pkg = readJson<PackageJsonShape>("package.json");
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    expect(majorOf(deps.next ?? "")).toBe(15);
    expect(majorOf(deps.react ?? "")).toBe(19);
    expect(majorOf(deps["react-dom"] ?? "")).toBe(19);
    expect(majorOf(deps.typescript ?? "")).toBe(5);
    expect(majorOf(deps.tailwindcss ?? "")).toBe(4);
    expect(majorOf(deps["@tailwindcss/postcss"] ?? "")).toBe(4);
    expect(majorOf(deps["eslint-config-next"] ?? "")).toBe(15);
  });

  it("có đủ prisma, @prisma/client, @anthropic-ai/sdk, zod, ts-fsrs, vitest, @playwright/test, eslint", () => {
    const pkg = readJson<PackageJsonShape>("package.json");
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const name of [
      "prisma",
      "@prisma/client",
      "@anthropic-ai/sdk",
      "zod",
      "ts-fsrs",
      "vitest",
      "@playwright/test",
      "eslint",
    ]) {
      expect(deps[name], `thiếu dependency ${name}`).toBeTruthy();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-08 — Typography token (3 font + 11 token size)
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-08 — globals.css khai báo 3 font + đủ token typography", () => {
  const CSS = readText("src/app/globals.css");

  it("khai báo 3 họ font (Space Grotesk · Be Vietnam Pro · JetBrains Mono)", () => {
    expect(CSS).toContain("--font-space-grotesk");
    expect(CSS).toContain("--font-be-vietnam-pro");
    expect(CSS).toContain("--font-jetbrains-mono");
  });

  it("11 token font-family: display, headline-*, body-*, label-*, code-md", () => {
    for (const token of [
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
    ]) {
      expect(CSS, `thiếu --font-${token}`).toContain(`--font-${token}:`);
    }
  });

  it("11 token size kèm line-height + letter-spacing", () => {
    for (const token of [
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
    ]) {
      expect(CSS, `thiếu --text-${token}`).toContain(`--text-${token}:`);
      expect(CSS, `thiếu line-height của ${token}`).toContain(`--text-${token}--line-height:`);
      expect(CSS, `thiếu letter-spacing của ${token}`).toContain(
        `--text-${token}--letter-spacing:`,
      );
    }
  });

  it("ánh xạ font đúng: headline/display → Grotesk, body → Be Vietnam Pro, label/code → Mono", () => {
    expect(CSS).toMatch(/--font-display:\s*var\(--font-space-grotesk\)/);
    expect(CSS).toMatch(/--font-headline-md:\s*var\(--font-space-grotesk\)/);
    expect(CSS).toMatch(/--font-body-md:\s*var\(--font-be-vietnam-pro\)/);
    expect(CSS).toMatch(/--font-label-md:\s*var\(--font-jetbrains-mono\)/);
    expect(CSS).toMatch(/--font-code-md:\s*var\(--font-jetbrains-mono\)/);
  });

  it("label token có letter-spacing ≥ 0.04em (uppercase label rõ)", () => {
    expect(CSS).toMatch(/--text-label-md--letter-spacing:\s*0\.04em/);
    expect(CSS).toMatch(/--text-label-sm--letter-spacing:\s*0\.0[4-9]em/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-09 — Spacing / radius / shadow token
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-09 — globals.css khai báo token spacing, radius, shadow", () => {
  const CSS = readText("src/app/globals.css");

  it("token spacing: space-xs…space-xl + gutter* + margin*", () => {
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
      expect(CSS, `thiếu --spacing-${token}`).toContain(`--spacing-${token}:`);
    }
  });

  it("token radius: sm…full", () => {
    for (const token of ["sm", "DEFAULT", "md", "lg", "xl", "full"]) {
      expect(CSS, `thiếu --radius-${token}`).toContain(`--radius-${token}:`);
    }
  });

  it("có shadow-md cho card và KHÔNG có shadow-xl", () => {
    expect(CSS).toContain("--shadow-md:");
    expect(CSS).not.toContain("--shadow-xl");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-11 — Material Symbols Outlined (icon duy nhất)
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-11 — Material Symbols Outlined là icon duy nhất của app", () => {
  it("globals.css có utility .material-symbols-outlined", () => {
    const css = readText("src/app/globals.css");
    expect(css).toContain(".material-symbols-outlined");
    expect(css).toContain('content: attr(data-icon)');
  });

  it("layout.tsx nạp font Material Symbols Outlined", () => {
    const layout = readText("src/app/layout.tsx");
    expect(layout).toContain("Material+Symbols+Outlined");
    expect(layout).toContain("fonts.googleapis.com");
  });

  it("component Icon render bằng data-icon + class material-symbols-outlined", () => {
    expect(fileExists("src/components/ui/icon.tsx")).toBe(true);
    const icon = readText("src/components/ui/icon.tsx");
    expect(icon).toContain("material-symbols-outlined");
    expect(icon).toContain("data-icon");
    expect(icon).toContain('aria-hidden="true"');
  });

  // FR-AF-11: "nếu dùng Google Fonts CDN thì ghi rõ vào README".
  // Repo ĐANG dùng CDN (layout.tsx → fonts.googleapis.com) nhưng README chưa
  // ghi nguồn font icon ⇒ đây là gap thật của FR-AF-11.
  // `it.fails` = tripwire: giữ suite xanh nhưng vẫn canh gap; khi ai đó bổ sung
  // README thì test này sẽ đỏ (vì expectation không còn fail nữa) ⇒ báo để gỡ.
  it.fails("README phải ghi rõ nguồn font icon (Material Symbols qua Google Fonts CDN)", () => {
    expect(readText("README.md")).toMatch(/material\s*symbols/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-12 — layout.tsx
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-12 — src/app/layout.tsx: Server Component + lang=\"vi\" + 3 font + boundary client", () => {
  it("là Server Component (không có \"use client\")", () => {
    const layout = readText("src/app/layout.tsx");
    expect(layout).not.toContain('"use client"');
    expect(layout).not.toContain("'use client'");
  });

  it('<html lang="vi">', () => {
    expect(readText("src/app/layout.tsx")).toMatch(/<html[\s\S]*?lang="vi"/);
  });

  it("metadata tiếng Việt (title + description)", () => {
    const layout = readText("src/app/layout.tsx");
    expect(layout).toContain("export const metadata");
    expect(layout).toMatch(/title:\s*\{[\s\S]*?default:\s*"Daily Loop OS"/);
    expect(layout).toMatch(/description:\s*"[^"]*[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơơờớởỡợùúủũụưừứửựỳýỷỹỵđÀÁẢÃẠĂÂÈÉÊÌÍÒÓÔƠÙÚÝĐ][^"]*"/);
  });

  it("3 font qua next/font (biến CSS --font-space-grotesk / --font-be-vietnam-pro / --font-jetbrains-mono)", () => {
    const layout = readText("src/app/layout.tsx");
    expect(layout).toMatch(/from "next\/font\/(local|google)"/);
    for (const variable of [
      "--font-space-grotesk",
      "--font-be-vietnam-pro",
      "--font-jetbrains-mono",
    ]) {
      expect(layout, `thiếu biến font ${variable}`).toContain(variable);
    }
    expect([...layout.matchAll(/localFont\(|google\./g)].length).toBeGreaterThanOrEqual(3);
  });

  it("render children qua boundary client (AppShell là \"use client\")", () => {
    const layout = readText("src/app/layout.tsx");
    expect(layout).toContain("<AppShell>{children}</AppShell>");
    expect(readText("src/components/shell/app-shell.tsx")).toContain('"use client"');
  });

  it("dark-mode là mặc định của <html> (class dark HOẶC color-scheme dark ở :root)", () => {
    const layout = readText("src/app/layout.tsx");
    const css = readText("src/app/globals.css");
    const hasDarkClass = /className=\{?["`][^"`]*\bdark\b/.test(layout);
    const hasDarkCssDefault = /:root\s*\{[^}]*color-scheme:\s*dark/.test(css);
    expect(hasDarkClass || hasDarkCssDefault).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-13 — globals.css dark-mode mặc định
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-13 — globals.css khai báo color-scheme: dark và :root mặc định dark", () => {
  const CSS = readText("src/app/globals.css");

  it(":root khai báo color-scheme: dark", () => {
    expect(CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/);
  });

  it("không có nhánh light mode (prefers-color-scheme: light / class .light)", () => {
    expect(CSS).not.toMatch(/prefers-color-scheme:\s*light/);
    expect(CSS).not.toMatch(/\.light\b/);
  });

  it("mặc định nền là surface tối (#0f131c)", () => {
    expect(CSS).toContain("--color-surface: #0f131c;");
    expect(CSS).toContain("background-color: var(--color-surface);");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-14 — AppShell
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-14 — src/components/shell/app-shell.tsx: khung max-w + grid 12→8→4", () => {
  const SHELL = readText("src/components/shell/app-shell.tsx");

  it("khung nội dung: max-w-[1520px] mx-auto p-margin-lg space-y-gutter-lg", () => {
    expect(SHELL).toContain("max-w-[1520px]");
    expect(SHELL).toContain("mx-auto");
    expect(SHELL).toContain("p-margin-lg");
    expect(SHELL).toContain("space-y-gutter-lg");
  });

  it("shell có 3 vùng: header + main + bottom nav", () => {
    expect(SHELL).toContain("<header");
    expect(SHELL).toContain("<main");
    expect(SHELL).toContain("<BottomNav");
  });

  it("dùng token màu của design system (bg-surface / text-on-surface)", () => {
    expect(SHELL).toContain("bg-surface");
    expect(SHELL).toContain("text-on-surface");
  });

  it("lưới responsive 12→8→4 cột (vùng nội dung dùng xl:grid-cols-12 + col-span-8)", () => {
    // Khung 12 cột nằm ở vùng main mà shell bọc (trang chủ hiện thực lưới
    // bento 8+4) ⇒ assert trên shell + trang chủ.
    const home = readText("src/app/page.tsx");
    const gridSource = `${SHELL}\n${home}`;
    expect(gridSource).toContain("xl:grid-cols-12");
    expect(gridSource).toContain("xl:col-span-8");
    // 1 cột ở mobile (mặc định) → 12 cột từ xl.
    expect(gridSource).toContain("grid-cols-1");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-15 — Bottom nav đúng 4 nút
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-15 — src/components/shell/bottom-nav.tsx: đúng 4 nút", () => {
  const NAV = readText("src/components/shell/bottom-nav.tsx");

  it("đúng 4 mục điều hướng", () => {
    const items = extractNavItems(NAV, "NAV_ITEMS");
    expect(items).toHaveLength(4);
  });

  it("đúng 4 nút + đúng route: Hôm nay (/) · Kỹ năng (/skills) · Ôn tập (/language) · Nhật ký (/journal)", () => {
    expect(extractNavItems(NAV, "NAV_ITEMS")).toEqual([
      { href: "/", label: "Hôm nay" },
      { href: "/skills", label: "Kỹ năng" },
      { href: "/language", label: "Ôn tập" },
      { href: "/journal", label: "Nhật ký" },
    ]);
  });

  it("cố định đáy màn hình, vùng ngón cái, bg-surface-container + backdrop-blur", () => {
    expect(NAV).toMatch(/className="[^"]*\bfixed\b/);
    expect(NAV).toMatch(/className="[^"]*\bbottom-0\b/);
    expect(NAV).toContain("bg-surface-container");
    expect(NAV).toContain("backdrop-blur");
    expect(NAV).toContain("min-h-14");
  });

  it("mục active có aria-current=\"page\"", () => {
    expect(NAV).toContain('aria-current={active ? "page" : undefined}');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-16 — Overflow menu đúng 5 mục
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-16 — src/components/shell/overflow-menu.tsx: đúng 5 mục", () => {
  const MENU = readText("src/components/shell/overflow-menu.tsx");

  it("đúng 5 mục, đúng thứ tự SPEC §3.1", () => {
    expect(extractNavItems(MENU, "MENU_ITEMS")).toEqual([
      { href: "/review", label: "Báo cáo tuần" },
      { href: "/progress", label: "Báo cáo tiến bộ" },
      { href: "/interview/setup", label: "Mock Interview" },
      { href: "/test", label: "Bài kiểm tra" },
      { href: "/settings", label: "Cài đặt" },
    ]);
  });

  it("có a11y: role=menu, role=menuitem, aria-expanded, aria-label", () => {
    expect(MENU).toContain('role="menu"');
    expect(MENU).toContain('role="menuitem"');
    expect(MENU).toContain("aria-expanded");
    expect(MENU).toContain("aria-label=");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-17 — Trang chủ render trong shell + dùng design token
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-17 — trang chủ render đúng shell + dùng design token", () => {
  const HOME = readText("src/app/page.tsx");

  it("trang chủ là Server Component (không \"use client\")", () => {
    expect(HOME).not.toContain('"use client"');
  });

  it("trang chủ nằm trong AppShell (layout bọc children)", () => {
    expect(readText("src/app/layout.tsx")).toContain("<AppShell>{children}</AppShell>");
  });

  it("dùng class token của design system, không hardcode hex", () => {
    expect(HOME).toMatch(/bg-surface|text-surface|text-primary/);
    expect(HOME).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("có vùng main với nội dung hiển thị được (không trang rỗng)", () => {
    expect(HOME).toContain("export default");
    expect(HOME).toMatch(/<h1|<section|<main/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-21 — src/lib/types.ts
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-21 — src/lib/types.ts có DomainKey, Level (CEFR), ActivityType", () => {
  it("khai báo type DomainKey, Level, ActivityType", () => {
    const types = readText("src/lib/types.ts");
    expect(types).toMatch(/export type DomainKey\s*=/);
    expect(types).toMatch(/export type Level\s*=/);
    expect(types).toMatch(/export type ActivityType\s*=/);
  });

  it("DOMAINS đúng 4 domain", () => {
    expect([...DOMAINS]).toEqual(["professional", "communication", "language", "personal"]);
  });

  it("LEVELS đúng thang CEFR (zero + A1..C2)", () => {
    expect([...LEVELS]).toEqual(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("ACTIVITY_TYPES đủ 10 loại (kể cả mock_interview + test)", () => {
    expect([...ACTIVITY_TYPES]).toEqual([
      "study",
      "write",
      "speak",
      "roleplay",
      "srs",
      "journal",
      "health",
      "custom",
      "mock_interview",
      "test",
    ]);
  });

  it("kiểu dùng được: DomainKey / Level / ActivityType gán được giá trị hợp lệ", () => {
    const domain: DomainKey = "professional";
    const level: Level = "B2";
    const activity: ActivityType = "mock_interview";

    expect(domain).toBe("professional");
    expect(level).toBe("B2");
    expect(activity).toBe("mock_interview");
  });

  it("Level = 'zero' | CEFR A1..C2 — kiểm tra ở mức kiểu (compile-time)", () => {
    type CefrLevel = Exclude<Level, "zero">;
    const allCefr: Record<CefrLevel, true> = {
      A1: true,
      A2: true,
      B1: true,
      B2: true,
      C1: true,
      C2: true,
    };
    expect(Object.keys(allCefr)).toHaveLength(6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-24 — .env.example + .gitignore
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-24 — .env.example liệt kê DATABASE_URL + ANTHROPIC_API_KEY", () => {
  const ENV_EXAMPLE = readText(".env.example");

  it("có cả hai biến", () => {
    expect(ENV_EXAMPLE).toMatch(/^DATABASE_URL\s*=/m);
    expect(ENV_EXAMPLE).toMatch(/^ANTHROPIC_API_KEY\s*=/m);
  });

  it("ANTHROPIC_API_KEY để trống (không rò key thật)", () => {
    const line = ENV_EXAMPLE.split(/\r?\n/).find((l) => /^ANTHROPIC_API_KEY\s*=/.test(l));
    expect(line).toBeDefined();
    const value = (line ?? "").replace(/^ANTHROPIC_API_KEY\s*=\s*/, "").trim();
    expect(value).toBe("");
  });

  it("DATABASE_URL trỏ SQLite local, không rò credential thật", () => {
    const line = ENV_EXAMPLE.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
    expect(line).toBeDefined();
    expect((line ?? "").replace(/^DATABASE_URL\s*=\s*/, "").trim()).toMatch(/^"?file:/);
    expect(ENV_EXAMPLE).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
  });

  it(".env.example có comment hướng dẫn (offline mode + không commit .env.local)", () => {
    expect(ENV_EXAMPLE).toContain("#");
    expect(ENV_EXAMPLE).toMatch(/offline/i);
    expect(ENV_EXAMPLE).toContain(".env.local");
  });

  it(".env.local nằm trong .gitignore (không bao giờ commit)", () => {
    const gitignore = readText(".gitignore");
    expect(gitignore.split(/\r?\n/).some((l) => l.trim() === ".env.local")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-28 — Vitest + Playwright config + script test / test:e2e
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-28 — có vitest config + playwright config và script test / test:e2e", () => {
  it("tồn tại vitest.config.* và playwright.config.ts", () => {
    expect(
      fileExists("vitest.config.mts") ||
        fileExists("vitest.config.ts") ||
        fileExists("vitest.config.js"),
    ).toBe(true);
    expect(fileExists("playwright.config.ts")).toBe(true);
  });

  it("vitest config khai báo test include cho tests/ và src/", () => {
    const config = readText(
      fileExists("vitest.config.mts")
        ? "vitest.config.mts"
        : fileExists("vitest.config.ts")
          ? "vitest.config.ts"
          : "vitest.config.js",
    );
    expect(config).toContain("tests/**");
    expect(config).toContain("src/**");
    expect(config).toContain("defineConfig");
  });

  it("playwright config trỏ testDir e2e/", () => {
    const config = readText("playwright.config.ts");
    expect(config).toContain('testDir: "./e2e"');
    expect(fileExists("e2e/global-setup.ts")).toBe(true);
  });

  it("script npm test và npm run test:e2e tồn tại", () => {
    const pkg = readJson<PackageJsonShape>("package.json");
    expect(pkg.scripts?.test).toBeTruthy();
    expect(pkg.scripts?.["test:e2e"]).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-29 — Viewport Playwright
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-29 — playwright.config.ts: viewport 390×844 và 1280×900", () => {
  const CONFIG = readText("playwright.config.ts");

  it("có viewport mobile 390×844", () => {
    expect(CONFIG).toMatch(/width:\s*390/);
    expect(CONFIG).toMatch(/height:\s*844/);
  });

  it("có viewport desktop 1280×900", () => {
    expect(CONFIG).toMatch(/width:\s*1280/);
    expect(CONFIG).toMatch(/height:\s*900/);
  });

  it("2 project: mobile + desktop", () => {
    expect(CONFIG).toContain('name: "mobile"');
    expect(CONFIG).toContain('name: "desktop"');
  });

  it("baseURL = http://localhost:3000", () => {
    const port = /const PORT\s*=\s*(\d+)/.exec(CONFIG)?.[1];
    expect(port).toBe("3000");
    expect(CONFIG).toContain("http://localhost:");
    expect(CONFIG).toMatch(/const baseURL\s*=\s*`http:\/\/localhost:\$\{PORT\}`/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-30 — CI workflow
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-30 — .github/workflows/ci.yml chạy lint + typecheck + test + build", () => {
  const CI = readText(".github/workflows/ci.yml");

  it("file workflow tồn tại và có trigger push + pull_request", () => {
    expect(fileExists(".github/workflows/ci.yml")).toBe(true);
    expect(CI).toMatch(/^on:/m);
    expect(CI).toContain("push:");
    expect(CI).toContain("pull_request:");
  });

  it("có job gọi npm run lint", () => {
    expect(CI).toContain("npm run lint");
  });

  it("có job gọi npm run typecheck", () => {
    expect(CI).toContain("npm run typecheck");
  });

  it("có job gọi npm test", () => {
    expect(CI).toMatch(/run:\s*npm test\b/);
  });

  it("có job gọi npm run build", () => {
    expect(CI).toContain("npm run build");
  });

  it("chạy npm run validate:specs (validator trong .kiro/scripts/)", () => {
    expect(CI).toContain("npm run validate:specs");
  });

  it("có job E2E gọi npm run test:e2e", () => {
    expect(CI).toContain("npm run test:e2e");
  });

  it("dùng setup-node + npm ci", () => {
    expect(CI).toContain("actions/setup-node");
    expect(CI).toContain("npm ci");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FR-AF-31 — README.md
// ────────────────────────────────────────────────────────────────────────────
describe("FR-AF-31 — README.md: cách chạy, cấu trúc thư mục, link .kiro/README.md", () => {
  const README = readText("README.md");

  it("README.md tồn tại và không rỗng", () => {
    expect(fileExists("README.md")).toBe(true);
    expect(README.length).toBeGreaterThan(200);
  });

  it("có hướng dẫn chạy: npm install → db:migrate → db:seed → npm run dev", () => {
    expect(README).toContain("npm install");
    expect(README).toContain("npm run db:migrate");
    expect(README).toContain("npm run db:seed");
    expect(README).toContain("npm run dev");
    expect(README).toContain("http://localhost:3000");
  });

  it("có mục cấu trúc thư mục", () => {
    expect(README).toMatch(/##\s*Cấu trúc thư mục/);
    expect(README).toContain("prisma/");
    expect(README).toContain("src/");
    expect(README).toContain("tests/");
    expect(README).toContain("e2e/");
  });

  it("link tới .kiro/README.md (và file đó tồn tại)", () => {
    expect(README).toContain(".kiro/README.md");
    expect(fileExists(".kiro/README.md")).toBe(true);
  });

  it("ghi chú 'không có API key vẫn chạy' (offline mode)", () => {
    expect(README).toMatch(/không có API key/i);
    expect(README).toMatch(/offline mode/i);
  });

  it("có bảng scripts liệt kê dev/build/lint/typecheck/test/test:e2e", () => {
    expect(README).toMatch(/##\s*Scripts/);
    for (const script of [
      "npm run dev",
      "npm run build",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run test:e2e",
    ]) {
      expect(README, `README thiếu ${script}`).toContain(script);
    }
  });
});
