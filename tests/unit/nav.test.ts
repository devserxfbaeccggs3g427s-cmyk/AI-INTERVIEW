/**
 * Unit test cho `src/lib/nav.ts` (tasks.md 3.2 / 3.5 · AC-15).
 *
 * AC-15 đòi "highlight đúng **1** mục trên mọi route". Bảng route 21 màn hình
 * ở đây là **sự thật gốc** — mọi route đều phải resolve được đúng 1 mục nav.
 *
 * Bảng này cũng dùng lại cho `tests/e2e/shell.spec.ts` — nếu 2 nơi lệch nhau,
 * test e2e sẽ fail và bắt được.
 */

import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavItem, isNavActive, navHrefForPathname } from "@/lib/nav";

/**
 * 21 route màn hình (SPEC.md §3.1) → mục nav phải active.
 *
 * `/skills/abc123` và `/interview/demo-session`, `/test/demo-test` là route
 * giả để test logic — hàm chỉ so khớp prefix, không cần id có tồn tại.
 */
export const ROUTE_NAV_EXPECTATIONS: ReadonlyArray<readonly [string, string]> = [
  ["/", "/"],
  ["/plan", "/"],
  ["/skills", "/skills"],
  ["/skills/abc123", "/skills"],
  ["/log", "/"],
  ["/log/history", "/"],
  ["/journal", "/journal"],
  ["/speak/write", "/speak/write"],
  ["/speak/talk", "/speak/write"],
  ["/language", "/language"],
  ["/language/session", "/language"],
  ["/language/practice", "/language"],
  ["/state", "/"],
  ["/review", "/review"],
  ["/progress", "/review"],
  ["/settings", "/settings"],
  ["/interview/setup", "/interview/setup"],
  ["/interview/session", "/interview/setup"],
  ["/interview/demo-session", "/interview/setup"],
  ["/test", "/test"],
  ["/test/session", "/test"],
  ["/test/demo-test", "/test"],
];

describe("nav — NAV_ITEMS", () => {
  it("đúng 9 mục", () => {
    expect(NAV_ITEMS).toHaveLength(9);
  });

  it("mục 8 có nhãn \"Báo cáo tuần & tiến độ\"", () => {
    expect(NAV_ITEMS[7]?.label).toBe("Báo cáo tuần & tiến độ");
  });

  it("mọi mục có href / label / icon, không trùng href", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.icon.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
  });

  it("tiền tố `sections` của mọi mục là duy nhất", () => {
    const prefixes = NAV_ITEMS.flatMap((item) => item.sections ?? []);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("nav — isNavActive (so khớp prefix)", () => {
  it("`/` chỉ active khi pathname đúng bằng `/`", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/plan", "/")).toBe(false);
  });

  it("giữ ranh giới bằng dấu gạch chéo", () => {
    expect(isNavActive("/skills/abc", "/skills")).toBe(true);
    expect(isNavActive("/skills-abc", "/skills")).toBe(false);
  });
});

describe("nav — phân hệ route (AC-15: đúng 1 mục active trên mọi route)", () => {
  it("mọi route trong bảng 21 màn hình resolve đúng 1 mục nav", () => {
    for (const [pathname, expectedHref] of ROUTE_NAV_EXPECTATIONS) {
      expect(navHrefForPathname(pathname), `route ${pathname}`).toBe(expectedHref);
      const item = activeNavItem(pathname);
      expect(item, `route ${pathname} không tìm thấy nav item`).toBeDefined();
      expect(item?.href, `route ${pathname}`).toBe(expectedHref);
    }
  });

  it("mọi route đều resolve tới href có thật trong NAV_ITEMS", () => {
    const hrefs = new Set(NAV_ITEMS.map((i) => i.href));
    for (const [pathname] of ROUTE_NAV_EXPECTATIONS) {
      const href = navHrefForPathname(pathname);
      expect(hrefs.has(href ?? ""), `route ${pathname}`).toBe(true);
    }
  });

  it("route lạ trả về null thay vì ném lỗi", () => {
    expect(navHrefForPathname("/khong-ton-tai")).toBeNull();
    expect(activeNavItem("/khong-ton-tai")).toBeUndefined();
  });

  it("route động Phase 1 vẫn resolve (S18 `/interview/[id]`, S21 `/test/[id]`)", () => {
    expect(navHrefForPathname("/interview/session-abc")).toBe("/interview/setup");
    expect(navHrefForPathname("/test/session-abc")).toBe("/test");
  });
});
