import { expect, test } from "@playwright/test";

test.describe("shell — layout shell & điều hướng", () => {
  test("trang chủ render không lỗi console", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        // Bỏ qua lỗi 404 font CDN — Material Symbols tải từ CDN, có thể fail khi offline.
        if (!text.includes("404") && !text.includes("fonts.googleapis.com")) {
          errors.push(text);
        }
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    await expect(page).toHaveTitle(/Daily Loop OS/);
    await expect(page.locator("h1")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("html có lang=vi", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  });

  test("bottom nav có đúng 4 mục (AC-AF-4)", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(nav).toBeVisible();

    const items = nav.getByRole("link");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveText(/Hôm nay/);
    await expect(items.nth(1)).toHaveText(/Kỹ năng/);
    await expect(items.nth(2)).toHaveText(/Ôn tập/);
    await expect(items.nth(3)).toHaveText(/Nhật ký/);
  });

  test("mục nav đang active có aria-current=page", async ({ page }) => {
    await page.goto("/");
    const active = page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(/Hôm nay/);
  });

  test("menu góc phải có đúng 5 mục (AC-AF-5)", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Mở menu" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const items = menu.getByRole("menuitem");
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toHaveText(/Báo cáo tuần/);
    await expect(items.nth(1)).toHaveText(/Báo cáo tiến bộ/);
    await expect(items.nth(2)).toHaveText(/Mock Interview/);
    await expect(items.nth(3)).toHaveText(/Bài kiểm tra/);
    await expect(items.nth(4)).toHaveText(/Cài đặt/);
  });

  test("menu đóng bằng phím Escape và focus quay về trigger", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Mở menu" });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("menu đóng khi click ra ngoài", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Mở menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();

    // Click vào vùng nội dung (ngoài menu) để đóng.
    await page.locator("main").click({ position: { x: 10, y: 10 } });

    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("responsive — không tràn ngang (AC-AF-9)", () => {
  test("không có scrollbar ngang ở 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("bottom nav hiển thị đủ 4 mục ở 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 667 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(nav.getByRole("link")).toHaveCount(4);

    const { scrollWidth, offenders } = await page.evaluate(() => {
      const list: Array<{ tag: string; cls: string; right: number; text: string }> = [];

      document.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 0.5) {
          list.push({
            tag: el.tagName,
            cls: (el.className || "").toString().slice(0, 100),
            right: Math.round(rect.right),
            text: (el.textContent || "").trim().slice(0, 60),
          });
        }
      });

      return {
        scrollWidth: document.documentElement.scrollWidth,
        offenders: list.slice(0, 8),
      };
    });

    // Diagnostic: cho biết element nào tràn ngang khi fail.
    expect(
      scrollWidth,
      `scrollWidth=${scrollWidth}; tràn: ${JSON.stringify(offenders)}`,
    ).toBeLessThanOrEqual(320);
  });

  test("container giữ max-width 1520px ở viewport rộng", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/");

    const main = page.locator("main");
    const width = await main.evaluate((el) => el.getBoundingClientRect().width);

    // max-w-[1520px] + padding 2×margin-lg(2.5rem) = 1520px
    expect(width).toBeLessThanOrEqual(1520);
    expect(width).toBeGreaterThan(0);
  });
});

test.describe("a11y nền (AC-AF-8)", () => {
  test("mọi nút có accessible name", async ({ page }) => {
    await page.goto("/");

    const unnamed = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons
        .filter((button) => {
          const label =
            button.getAttribute("aria-label") ??
            button.textContent?.trim() ??
            "";
          return label.length === 0;
        })
        .map((button) => button.outerHTML.slice(0, 120));
    });

    expect(unnamed).toEqual([]);
  });

  test("icon-only button có aria-label", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Mở menu" });
    await expect(trigger).toBeVisible();
  });

  test("focus ring dùng màu primary của design system", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Mở menu" });
    await trigger.focus();

    // Tailwind v4 `ring-2 ring-primary` hiện thực bằng box-shadow, không phải outline.
    const ringColor = await trigger.evaluate((el) => {
      const shadow = window.getComputedStyle(el).boxShadow;
      // Màu primary = #4edea3 → rgb(78, 222, 163)
      return shadow.includes("rgb(78, 222, 163)") ? "rgb(78, 222, 163)" : shadow;
    });

    expect(ringColor).toBe("rgb(78, 222, 163)");
  });
});

test.describe("design token áp dụng thật (AC-AF-3)", () => {
  test("nền body = surface #0f131c", async ({ page }) => {
    await page.goto("/");

    const background = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe("rgb(15, 19, 28)");
  });

  test("tiêu đề dùng Space Grotesk", async ({ page }) => {
    await page.goto("/");

    const fontFamily = await page.locator("h1").evaluate(
      (el) => window.getComputedStyle(el).fontFamily,
    );
    // ⚠️ `next/font/local` đặt tên font theo tên file (đã bỏ dấu cách)
    // ⇒ "Space Grotesk" thành "spaceGrotesk". So khớp không phân biệt hoa
    // thường + bỏ khoảng trắng cho cả hai vế.
    const normalized = fontFamily.toLowerCase().replace(/\s+/g, "");
    expect(normalized).toContain("spacegrotesk");
  });

  test("body dùng Be Vietnam Pro", async ({ page }) => {
    await page.goto("/");

    const fontFamily = await page.evaluate(
      () => window.getComputedStyle(document.body).fontFamily,
    );
    const normalized = fontFamily.toLowerCase().replace(/\s+/g, "");
    expect(normalized).toContain("bevietnampro");
  });

  test("font tiếng Việt có đủ glyph dấu", async ({ page }) => {
    await page.goto("/");

    const ok = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px "Be Vietnam Pro"', "Tiếng Việt có đủ dấu: ễ ộ ằ ữ");
    });
    expect(ok).toBe(true);
  });
});

test.describe("offline mode (AC-AF-6)", () => {
  test("thiếu API key → hiện banner offline, không lỗi console", async ({ page }) => {
    const errors: string[] = [];

    // ⚠️ Console error của browser KHÔNG chứa URL ⇒ dùng `requestfailed` +
    // `response` để biết chính xác request nào hỏng.
    const FONT_CDN = /fonts\.(googleapis|gstatic)\.com/;

    page.on("requestfailed", (request) => {
      if (FONT_CDN.test(request.url())) return;

      const errorText = request.failure()?.errorText ?? "";

      // ⚠️ `ERR_ABORTED` = browser chủ động hủy request (prefetch bị hủy khi
      // điều hướng/unmount). Không phải lỗi server ⇒ bỏ qua.
      if (errorText.includes("ERR_ABORTED")) return;

      errors.push(`requestfailed: ${request.url()} — ${errorText}`);
    });

    page.on("response", (response) => {
      if (response.status() < 400) return;
      if (FONT_CDN.test(response.url())) return;
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    // .env.local không có ANTHROPIC_API_KEY → offline mode.
    await expect(page.getByText(/offline mode/i).first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});
