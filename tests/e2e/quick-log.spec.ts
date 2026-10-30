import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";

/**
 * S05 — Quick-log (task 5.8 · AC-2 · AC-14).
 *
 * Kiểm chứng:
 *   1. Ghi nhanh hoàn tất trong **≤10s** (đo từ lúc bấm "Ghi nhanh ngay"
 *      tới khi toast xuất hiện) — AC-2.
 *   2. Dòng **mới nhất ở đầu** danh sách lịch sử — task 5.6.
 *   3. Bản nháp `localStorage` **giữ lại** sau khi reload — task 5.7 / AC-14.
 *
 * Lưu ý: test KHÔNG phụ thuộc AI — `POST /api/log` ghi `Activity` tức thì
 * (task 5.3), nên thời gian đo chỉ phản ánh độ trễ ghi DB.
 */

/** Key bản nháp — đặc tả AC-14 quy định đúng key này. */
const DRAFT_KEY = "daily-loop:quicklog-draft";

test.describe("S05 — Quick-log", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("mở sheet bằng Cmd/Ctrl+K, focus vào ô nhập, ghi nhanh ≤10s", async ({ page }) => {
    await page.goto("/");

    // Mở bằng phím tắt.
    await page.keyboard.press("ControlOrMeta+k");

    const textarea = page.getByTestId("quicklog-textarea");
    await expect(textarea).toBeVisible();

    // Focus vào ô nhập khi mở (task 5.1).
    await expect(textarea).toBeFocused();

    // Gõ nội dung rồi ghi.
    await textarea.fill("Luyện nghe tiếng Trung 15 phút");
    await page.getByTestId("quicklog-title").fill("Luyện nghe tiếng Trung");

    const started = Date.now();
    await page.getByTestId("quicklog-submit").click();

    // Toast "Đã ghi nhận" xuất hiện → đo thời gian (AC-2: ≤10s).
    await expect(page.getByText("Đã ghi nhận").first()).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThanOrEqual(10_000);

    // Activity đã ghi vào DB.
    const activity = await prisma.activity.findFirst({
      where: { title: "Luyện nghe tiếng Trung" },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).not.toBeNull();

    // Sheet đóng sau khi ghi.
    await expect(textarea).toBeHidden();
  });

  test("Escape đóng sheet", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("quicklog-textarea")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("quicklog-textarea")).toBeHidden();
  });

  test("preset chip đánh số 1–6 điền nội dung mẫu + focus ô nhập", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");

    const textarea = page.getByTestId("quicklog-textarea");
    await expect(textarea).toBeVisible();
    // Đợi focus vào ô nhập (task 5.1) trước khi nhấn phím tắt.
    await expect(textarea).toBeFocused();

    // Nhấn phím "3" (mẫu Viết) → điền nội dung mẫu.
    await page.keyboard.press("3");
    await expect(textarea).toHaveValue(/Viết/);
    await expect(textarea).toBeFocused();

    // Bấm chip "5" (Nhật ký) → nội dung mẫu khác.
    await page.getByTestId("preset-5").click();
    await expect(textarea).toHaveValue(/Nhật ký/);
  });

  test("phím 1–6 không ghi đè nội dung đang gõ", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");

    const textarea = page.getByTestId("quicklog-textarea");
    await expect(textarea).toBeFocused();
    await textarea.fill("Nội dung riêng của tôi");
    // Đợi DOM value thực sự được cập nhật (ground truth) — React controlled
    // input có thể chưa sync giá trị vào DOM khi keydown fired.
    await expect(textarea).toHaveValue("Nội dung riêng của tôi");
    await page.waitForTimeout(100);

    // Double-check DOM value trực tiếp — tránh race.
    const domValue = await textarea.evaluate((el) => (el as HTMLTextAreaElement).value);
    expect(domValue).toBe("Nội dung riêng của tôi");

    await page.keyboard.press("2");

    // Nội dung người dùng được giữ nguyên (không có "2" được append).
    await expect(textarea).toHaveValue("Nội dung riêng của tôi");
  });

  test("bản nháp giữ lại sau khi reload (AC-14)", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");

    const textarea = page.getByTestId("quicklog-textarea");
    await textarea.fill("Bản nháp chưa ghi xong");

    // Đợi debounce lưu bản nháp.
    await expect
      .poll(
        async () =>
          page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY),
        { timeout: 5000 },
      )
      .toContain("Bản nháp chưa ghi xong");

    // Đóng sheet rồi reload → mở lại vẫn còn nội dung.
    await page.keyboard.press("Escape");
    await page.reload();
    await page.keyboard.press("ControlOrMeta+k");

    await expect(page.getByTestId("quicklog-textarea")).toHaveValue("Bản nháp chưa ghi xong");
  });

  test("lịch sử: dòng mới nhất ở đầu", async ({ page }) => {
    const title = `E2E mới nhất ${Date.now()}`;

    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("quicklog-textarea").fill(title);
    await page.getByTestId("quicklog-title").fill(title);
    await page.getByTestId("quicklog-submit").click();
    await expect(page.getByText("Đã ghi nhận").first()).toBeVisible({ timeout: 10_000 });

    // Vào lịch sử → dòng vừa ghi phải ở vị trí đầu tiên.
    await page.goto("/log/history");
    const list = page.getByTestId("history-list");
    await expect(list).toBeVisible();

    const firstRow = list.locator("li").first();
    await expect(firstRow).toContainText(title);
  });

  test("lọc theo lĩnh vực bằng chip", async ({ page }) => {
    await page.goto("/log/history");
    await page.getByTestId("filter-personal").click();
    await expect(page).toHaveURL(/domain=personal/);
    // Chờ page load xong sau navigation (server-side filter reloads page).
    // Nếu domain không có hoạt động nào → render empty state, không có history-list.
    await expect(
      page
        .getByText(/Chưa có hoạt động nào trong lĩnh vực|Chưa có hoạt động nào\. Dùng nút/)
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
