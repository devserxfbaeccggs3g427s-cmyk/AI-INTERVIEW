import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("a11y — axe (AC-AF-8)", () => {
  test("trang chủ không có lỗi axe critical/serious", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();

    const serious = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );

    const summary = serious.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} node`,
    );

    expect(summary).toEqual([]);
  });

  test("trang chủ không có lỗi axe nào (kể cả moderate)", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();

    const summary = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} node`,
    );

    expect(summary).toEqual([]);
  });

  test("mọi link có accessible name", async ({ page }) => {
    await page.goto("/");

    const unnamed = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      return links
        .filter((link) => {
          const label =
            link.getAttribute("aria-label") ?? link.textContent?.trim() ?? "";
          return label.length === 0;
        })
        .map((link) => link.outerHTML.slice(0, 120));
    });

    expect(unnamed).toEqual([]);
  });

  test("nhãn (label) dùng JetBrains Mono + letter-spacing ≥ 0.04em", async ({ page }) => {
    await page.goto("/");

    // Label uppercase đầu tiên trên trang (S01 thay placeholder Phase -1).
    const label = page.locator("span.font-label-sm").first();

    const styles = await label.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontFamily: computed.fontFamily,
        letterSpacing: computed.letterSpacing,
      };
    });

    // ⚠️ `next/font/local` đặt tên font theo tên file ⇒ "JetBrains Mono"
    // thành "jetbrainsMono". So khớp không phân biệt hoa thường + bỏ khoảng
    // trắng cho cả hai vế.
    const normalized = styles.fontFamily.toLowerCase().replace(/\s+/g, "");
    expect(normalized).toContain("jetbrainsmono");
    // 0.04em ở font-size 0.6875rem (11px) ≈ 0.44px
    expect(Number.parseFloat(styles.letterSpacing)).toBeGreaterThanOrEqual(0.4);
  });
});
