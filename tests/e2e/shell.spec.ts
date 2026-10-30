/**
 * E2E — Shell đồng nhất trên 21 route (task 3.9 · AC-15).
 *
 * AC-15: "21 route render cùng sidebar 9 mục + header". Đây là test bảo vệ
 * lỗi mockup #4 (design.md §9.4): 20/21 màn hình Stitch **thiếu trạng thái
 * active** → user không biết đang ở màn nào.
 *
 * Mỗi route phải thỏa 4 điều kiện:
 *   1. HTTP 200 (không 404 / 500).
 *   2. Sidebar có đúng **9 mục nav**.
 *   3. Đúng **1 mục nav active** (`[data-active="true"]`) — mục đúng theo
 *      phân hệ mà route thuộc về.
 *   4. Header có **4 chip**: ngày · streak · năng lượng tuần · AI.
 *
 * Xem tasks.md 3.9 · design.md §2.1 (route), §2.3 (shell), §9.4 mục 4.
 */

import { expect, test, type Page } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";

/** Số mục nav bắt buộc — `lib/nav.ts` NAV_ITEMS. */
const NAV_ITEM_COUNT = 9;

/**
 * Id skill thật để test route `/skills/[id]` (S04).
 *
 * Id là `cuid` sinh ngẫu nhiên mỗi lần seed → **không** hardcode trong test.
 * `src/app/skills/[id]/page.tsx` gọi `notFound()` cho id không tồn tại, nên
 * route giả (`/skills/demo-skill`) sẽ 404 — phải dùng id có thật trong DB.
 */
let seededSkillId = "";

/**
 * 21 route theo design.md §2.1 + `expectedNavHref` là mục nav **phải** active.
 *
 * `expectedNavHref` suy ra từ phân hệ của màn hình (xem SPEC.md §3.1):
 *   - `/` → "Hôm nay"
 *   - `/plan` → "Hôm nay" (S02 sinh kế hoạch cho hôm nay)
 *   - `/skills`, `/skills/[id]` → "Cây kỹ năng"
 *   - `/log`, `/log/history` → "Hôm nay" (Quick-log là thao tác trong ngày)
 *   - `/journal` → "Nhật ký & AI"
 *   - `/speak/*` → "Luyện giao tiếp"
 *   - `/language/*` → "Ôn tập ngoại ngữ"
 *   - `/state` → "Hôm nay" (đánh giá chính là phần của vòng lặp ngày)
 *   - `/review`, `/progress` → "Báo cáo tuần & tiến độ"
 *   - `/settings` → "Cài đặt"
 *   - `/interview/*` → "Mock Interview"
 *   - `/test/*` → "Bài kiểm tra"
 */
const ROUTES: Array<{ path: string; expectedNavHref: string; screen: string }> = [
  { path: "/", expectedNavHref: "/", screen: "S01" },
  { path: "/plan", expectedNavHref: "/", screen: "S02" },
  { path: "/skills", expectedNavHref: "/skills", screen: "S03" },
  // `/skills/[id]` — id thật lấy từ DB (xem `seededSkillId`).
  { path: "/skills/__SKILL_ID__", expectedNavHref: "/skills", screen: "S04" },
  { path: "/log", expectedNavHref: "/", screen: "S05" },
  { path: "/log/history", expectedNavHref: "/", screen: "S05" },
  { path: "/journal", expectedNavHref: "/journal", screen: "S06" },
  { path: "/speak/write", expectedNavHref: "/speak/write", screen: "S07" },
  { path: "/speak/talk", expectedNavHref: "/speak/write", screen: "S08" },
  { path: "/language", expectedNavHref: "/language", screen: "S09" },
  { path: "/language/session", expectedNavHref: "/language", screen: "S10" },
  { path: "/language/practice", expectedNavHref: "/language", screen: "S11" },
  { path: "/state", expectedNavHref: "/", screen: "S12" },
  { path: "/review", expectedNavHref: "/review", screen: "S13" },
  { path: "/progress", expectedNavHref: "/review", screen: "S14" },
  { path: "/settings", expectedNavHref: "/settings", screen: "S15" },
  { path: "/interview/setup", expectedNavHref: "/interview/setup", screen: "S16" },
  { path: "/interview/session", expectedNavHref: "/interview/setup", screen: "S17" },
  { path: "/interview/demo-session", expectedNavHref: "/interview/setup", screen: "S18" },
  { path: "/test", expectedNavHref: "/test", screen: "S19" },
  { path: "/test/session", expectedNavHref: "/test", screen: "S20" },
  { path: "/test/demo-test", expectedNavHref: "/test", screen: "S21" },
];

/**
 * Chờ sidebar render xong.
 *
 * Sidebar là Client Component (`usePathname()`) nên `data-active` chỉ có sau
 * khi React hydrate — phải chờ, không assert ngay lúc response về.
 */
async function gotoAndWaitForShell(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("aside nav a")).toHaveCount(NAV_ITEM_COUNT);
  return response;
}

test.describe("AC-15 — shell đồng nhất trên 21 route", () => {
  test.beforeAll(async () => {
    const skill = await prisma.skill.findFirst({
      where: { parentId: null },
      orderBy: [{ position: "asc" }],
      select: { id: true },
    });
    if (!skill) throw new Error("Cây kỹ năng chưa được seed.");
    seededSkillId = skill.id;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  for (const route of ROUTES) {
    test(`${route.screen} ${route.path} — 9 nav + 1 active + 4 chip header`, async ({
      page,
    }) => {
      const path = route.path.replace("__SKILL_ID__", seededSkillId);
      const response = await gotoAndWaitForShell(page, path);

      // 1) Route phải trả 200 — placeholder Phase 0 cũng phải render được.
      expect(response, `${path} không trả response`).not.toBeNull();
      expect(response?.status(), `${path} trả status lỗi`).toBe(200);

      // 2) Sidebar có đúng 9 mục nav.
      const navLinks = page.locator("aside nav a");
      await expect(navLinks).toHaveCount(NAV_ITEM_COUNT);

      // 3) Đúng 1 mục active — và đúng mục của phân hệ route này.
      const active = page.locator('aside [data-active="true"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute("href", route.expectedNavHref);

      // `aria-current="page"` phải đi cùng với `data-active` (NavLink).
      await expect(active).toHaveAttribute("aria-current", "page");

      // 4) Topbar (fixed header) có 4 chip: ngày · streak · năng lượng tuần · AI.
      // Dùng `[class*="fixed top-0"]` để chọn Topbar, không chọn PageHeader.
      const topbar = page.locator('header[class*="fixed top-0"]');
      await expect(topbar).toHaveCount(1);

      // Chip ngày: "Thứ X <dd>/<mm>".
      await expect(topbar.getByText(/Thứ .+\d+\/\d+/)).toBeVisible();
      // Chip streak.
      await expect(topbar.getByText(/Streak \d+ ngày/)).toBeVisible();
      // Chip năng lượng tuần.
      await expect(topbar.getByText(/Năng lượng tuần \d+%/)).toBeVisible();
      // Chip AI — nhãn phải phản ánh provider thật (FR-AI-11).
      await expect(
        topbar.getByText(/AI (Offline \/ Local \(Ollama\)|Online \/ Cloud \(Claude .+\))/),
      ).toBeVisible();
    });
  }
});

test.describe("AC-15 — điều hướng giữa các route", () => {
  test("mọi mục nav đều dẫn tới route render được", async ({ page }) => {
    await gotoAndWaitForShell(page, "/");

    const hrefs = await page.locator("aside nav a").evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
    );

    expect(hrefs).toHaveLength(NAV_ITEM_COUNT);
    expect(new Set(hrefs).size).toBe(NAV_ITEM_COUNT);

    for (const href of hrefs) {
      expect(href).not.toBe("");
      const response = await page.goto(href, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${href} không render được`).toBe(200);
    }
  });

  test("click nav → mục tương ứng chuyển sang active", async ({ page }) => {
    await gotoAndWaitForShell(page, "/");
    await page.locator('aside a[href="/settings"]').click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('aside [data-active="true"]')).toHaveCount(1);
    await expect(page.locator('aside [data-active="true"]')).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

test.describe("Task 3.8 — drawer sidebar dưới 1024px", () => {
  test("sidebar thu gọn và nút menu hiện ở viewport hẹp", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await gotoAndWaitForShell(page, "/");

    // Nút mở drawer chỉ hiện dưới 1024px (`lg:hidden` trong AppShell).
    const menuButton = page.getByRole("button", { name: /Mở menu|Đóng menu/ });
    await expect(menuButton).toBeVisible();

    // Sidebar bị trượt ra ngoài màn hình khi đóng.
    const sidebar = page.locator("aside");
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    // Bấm nút menu → sidebar trượt vào.
    await menuButton.click();
    await expect(sidebar).not.toHaveClass(/-translate-x-full/);
  });

  test("sidebar cố định ở viewport rộng", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndWaitForShell(page, "/");

    const sidebar = page.locator("aside");
    await expect(sidebar).toHaveClass(/lg:translate-x-0/);
    await expect(
      page.getByRole("button", { name: /Mở menu|Đóng menu/ }),
    ).toBeHidden();
  });
});
