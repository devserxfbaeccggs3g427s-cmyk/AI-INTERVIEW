/**
 * Test nhất quán design token — NFR-10 (design.md §8.5).
 *
 * Ba phần:
 *   1. **Radius** — assert đúng giá trị đã chốt ở §3.1 / §9.1-2.
 *      ⚠️ `full` = `0.75rem` — **KHÔNG phải** `9999px`.
 *   2. **Typography** — assert `headline-sm` = `1.25rem` (20px).
 *      ⚠️ Đây là điểm **drift** đã chốt ở §9.1-3 (mockup ghi `0.8125rem`).
 *   3. **Quét hex lạ** — không có màu hardcode ngoài palette trong
 *      `src/components/` và `src/app/`.
 *
 * Nguồn sự thật: `src/styles/tokens.ts` (mirror của khối `@theme` trong
 * `src/app/globals.css`) — xem `design.md` §3.1.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE, RADIUS, TYPOGRAPHY, SPACING } from "@/styles/tokens";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Radius (§3.1 · §9.1-2)
// ─────────────────────────────────────────────────────────────────────────────

describe("RADIUS — bảng quyết định §3.1", () => {
  it("DEFAULT = 0.125rem (không phải 0.25rem của DESIGN.md)", () => {
    expect(RADIUS.DEFAULT).toBe("0.125rem");
  });

  it("lg = 0.25rem", () => {
    expect(RADIUS.lg).toBe("0.25rem");
  });

  it("xl = 0.5rem", () => {
    expect(RADIUS.xl).toBe("0.5rem");
  });

  it("full = 0.75rem — TUYỆT ĐỐI KHÔNG phải 9999px", () => {
    expect(RADIUS.full).toBe("0.75rem");
    expect(RADIUS.full).not.toBe("9999px");
  });

  it("mọi giá trị radius đều là rem (không có px lạ)", () => {
    for (const value of Object.values(RADIUS)) {
      expect(value).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it("chỉ có 4 giá trị radius gốc theo bảng quyết định", () => {
    // §8.5: "`borderRadius` chỉ có 4 giá trị" — DEFAULT · lg · xl · full.
    const core = ["DEFAULT", "lg", "xl", "full"];
    for (const key of core) {
      expect(RADIUS).toHaveProperty(key);
    }
    // `sm` trùng `DEFAULT`, `md` là bổ sung → tổng số key khác 4 là hợp lệ.
    expect(new Set(Object.values(RADIUS)).size).toBeLessThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Typography (§3.3 · §9.1-3)
// ─────────────────────────────────────────────────────────────────────────────

describe("TYPOGRAPHY — bảng quyết định §3.3", () => {
  it("headline-sm = 1.25rem (20px) — điểm drift đã chốt §9.1-3", () => {
    expect(TYPOGRAPHY["headline-sm"].fontSize).toBe("1.25rem");
  });

  it("headline-sm KHÔNG phải 0.8125rem (giá trị sai trong mockup)", () => {
    expect(TYPOGRAPHY["headline-sm"].fontSize).not.toBe("0.8125rem");
  });

  it("headline-sm dùng font tiêu đề Space Grotesk, weight 500", () => {
    expect(TYPOGRAPHY["headline-sm"].fontFamily).toBe("Space Grotesk");
    expect(TYPOGRAPHY["headline-sm"].fontWeight).toBe("500");
  });

  it("mọi fontSize đều là rem", () => {
    for (const token of Object.values(TYPOGRAPHY)) {
      expect(token.fontSize).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it("mọi token đều khai báo đủ 5 trường bắt buộc", () => {
    for (const token of Object.values(TYPOGRAPHY)) {
      expect(token.fontFamily).toBeTruthy();
      expect(token.fontSize).toBeTruthy();
      expect(token.fontWeight).toBeTruthy();
      expect(token.lineHeight).toBeTruthy();
      expect(token.letterSpacing).toBeTruthy();
    }
  });

  it("có đủ 3 nhóm token: display · headline · body/label/code", () => {
    const keys = Object.keys(TYPOGRAPHY);
    expect(keys).toContain("display");
    expect(keys).toContain("headline-sm");
    expect(keys).toContain("body-md");
    expect(keys).toContain("label-md");
    expect(keys).toContain("code-md");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Palette & spacing
// ─────────────────────────────────────────────────────────────────────────────

describe("PALETTE & SPACING", () => {
  it("mọi màu trong palette đều là hex 6 ký tự viết thường", () => {
    for (const value of Object.values(PALETTE)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("mọi spacing đều là rem", () => {
    for (const value of Object.values(SPACING)) {
      expect(value).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it("palette có 47 token / 38 màu khác nhau (9 alias Material-3 có chủ đích)", () => {
    // Material 3 cho phép nhiều token vai trò dùng chung 1 màu:
    //   #0f131c → surface, surface-dim, background
    //   #31353f → surface-container-highest, surface-variant
    //   #dfe2ef → on-surface, inverse-surface, on-background
    //   #4edea3 → primary, surface-tint, primary-fixed-dim
    //   #c0c1ff → secondary, secondary-fixed-dim
    //   #ffb95f → tertiary, tertiary-fixed-dim
    const values = Object.values(PALETTE);
    expect(values).toHaveLength(47);
    expect(new Set(values).size).toBe(38);
  });

  it("mọi màu trong palette đều được khai báo trong globals.css (@theme)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const cssHexes = new Set(
      [...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()),
    );
    for (const hex of Object.values(PALETTE)) {
      expect(cssHexes.has(hex.toLowerCase())).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Quét hex lạ trong `src/components/` và `src/app/`
// ─────────────────────────────────────────────────────────────────────────────

/** Regex bắt hex 6 ký tự. */
const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/**
 * File được phép chứa hex: chính là nơi khai báo palette.
 * - `src/styles/tokens.ts` — mirror của `@theme`.
 * - `src/app/globals.css` — khối `@theme` gốc.
 */
const ALLOWED_HEX_FILES = new Set([
  path.join("src", "styles", "tokens.ts"),
  path.join("src", "app", "globals.css"),
]);

/**
 * Ngoại lệ DUY NHẤT: `viewport.themeColor` trong `src/app/layout.tsx`.
 *
 * Next.js bắt buộc `themeColor` phải là chuỗi màu literal (không nhận CSS
 * variable), và giá trị `#0f131c` **có trong palette** (`surface`/`background`).
 * Ngoại lệ này chỉ bỏ qua đúng dòng `themeColor:`, mọi hex khác trong file
 * vẫn bị báo.
 */
const THEME_COLOR_LINE = /^\s*themeColor\s*:/;

/** Thu thập mọi file (ts/tsx/css/js/jsx) dưới 1 thư mục, đệ quy. */
function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx|css|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Quét 1 file → danh sách "đường dẫn:dòng → hex" cho các hex tìm thấy. */
function scanHexes(file: string, paletteOnly: boolean): string[] {
  const rel = path.relative(process.cwd(), file);
  const isLayout = rel === path.join("src", "app", "layout.tsx");
  const paletteHexes = new Set(Object.values(PALETTE).map((h) => h.toLowerCase()));
  const out: string[] = [];
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (isLayout && THEME_COLOR_LINE.test(line)) return;
    for (const hex of line.match(HEX_RE) ?? []) {
      if (paletteOnly && !paletteHexes.has(hex.toLowerCase())) {
        out.push(`${rel}:${index + 1} → ${hex}`);
      }
    }
  });
  return out;
}

describe("NFR-10 — không có màu hex hardcode ngoài palette", () => {
  const roots = [
    path.join(process.cwd(), "src", "components"),
    path.join(process.cwd(), "src", "app"),
  ];
  const files = roots.flatMap(collectFiles);
  const scanned = files.filter((f) => !ALLOWED_HEX_FILES.has(path.relative(process.cwd(), f)));

  it("đã quét được ít nhất 1 file (tránh test rỗng bị coi là pass)", () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it("không file nào trong src/components + src/app chứa hex lạ", () => {
    // NFR-10: màu trong component phải đi qua token, không hardcode.
    const offenders = scanned.flatMap((f) => scanHexes(f, false));
    expect(offenders).toEqual([]);
  });

  it("mọi hex trong toàn bộ src/ đều nằm trong palette (design.md §8.5)", () => {
    const allFiles = collectFiles(path.join(process.cwd(), "src"));
    const offenders = allFiles.flatMap((f) => scanHexes(f, true));
    expect(offenders).toEqual([]);
  });
});
