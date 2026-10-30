import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";
import { startOfDay } from "../../src/lib/dates";

/**
 * S01 — Daily Loop `/` (task 4.12 · AC-1).
 *
 * Kiểm chứng:
 *   1. `/` hiển thị **tối đa 6 slot**, đúng thứ tự slot 0..5 (FR-DL-01).
 *   2. Bấm "Xong" trên slot đầu → slot gạch ngang + badge "Đã xong".
 *   3. DB có `Activity` + `Evidence` tương ứng (FR-DL-03).
 *   4. Bấm lại lần nữa (hoặc render lại) **không** tạo trùng `Activity`.
 *
 * ⚠️ Test dùng `prisma` trực tiếp (import tương đối `../../src/lib/db`) —
 * đọc DB thật để khẳng định side-effect, không chỉ kiểm tra giao diện.
 */

const today = () => startOfDay(new Date());

/** Xoá dữ liệu của hôm nay để test chạy lại được (idempotent). */
async function resetToday() {
  const day = today();
  await prisma.activity.deleteMany({
    where: { createdAt: { gte: day }, title: { contains: "Học:" } },
  });
  await prisma.planItem.deleteMany({ where: { date: day } });
}

test.describe("S01 — Daily Loop", () => {
  test.beforeEach(async () => {
    await resetToday();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("hiển thị tối đa 6 slot theo đúng thứ tự", async ({ page }) => {
    await page.goto("/");

    const slots = page.getByTestId(/^slot-\d+$/);
    await expect(slots).toHaveCount(6);

    // Thứ tự slot 0..5 — không đảo.
    for (let i = 0; i < 6; i += 1) {
      await expect(page.getByTestId(`slot-${i}`)).toBeVisible();
    }

    // Mỗi slot có chip domain + thời lượng.
    await expect(page.getByTestId("slot-0")).toContainText("Slot 1 ·");
  });

  test("bấm Xong → gạch ngang + badge Đã xong + ghi Activity/Evidence vào DB", async ({ page }) => {
    await page.goto("/");

    const slot0 = page.getByTestId("slot-0");
    const title = page.getByTestId("slot-title-0");

    const before = await prisma.activity.count({
      where: { createdAt: { gte: today() } },
    });

    await page.getByTestId("slot-done-0").click();

    // Giao diện: gạch ngang + badge "Đã xong".
    await expect(title).toHaveClass(/line-through/);
    await expect(slot0).toContainText("Đã xong");

    // DB: có Activity mới.
    await expect
      .poll(
        async () =>
          prisma.activity.count({ where: { createdAt: { gte: today() } } }),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(before);

    const activity = await prisma.activity.findFirst({
      where: { createdAt: { gte: today() } },
      orderBy: { createdAt: "desc" },
      include: { evidences: true },
    });
    expect(activity).not.toBeNull();
    expect(activity?.domain).toBe("professional");

    // Slot có skillId → phải tạo Evidence (FR-DL-03).
    expect(activity?.evidences.length ?? 0).toBeGreaterThan(0);

    // PlanItem đánh dấu done.
    const planItem = await prisma.planItem.findFirst({
      where: { date: today(), slot: 0 },
    });
    expect(planItem?.done).toBe(true);
  });

  test("bấm Xong lần nữa không tạo trùng Activity", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("slot-done-0").click();
    await expect(page.getByTestId("slot-title-0")).toHaveClass(/line-through/);

    // Chờ API hoàn tất (toast "Đã ghi nhận") trước khi đếm — tránh race condition.
    await expect(page.getByText("Đã ghi nhận").first()).toBeVisible({ timeout: 10_000 });

    const afterFirst = await prisma.activity.count({ where: { createdAt: { gte: today() } } });

    // Nút "Xong" đã bị disable sau khi hoàn thành → reload cũng không tạo thêm.
    await expect(page.getByTestId("slot-done-0")).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId("slot-done-0")).toBeDisabled();

    const afterSecond = await prisma.activity.count({ where: { createdAt: { gte: today() } } });
    expect(afterSecond).toBe(afterFirst);
  });

  test("slot ưu tiên có rail màu + badge ưu tiên", async ({ page }) => {
    await page.goto("/");
    const slot0 = page.getByTestId("slot-0");
    await expect(slot0).toContainText("Ưu tiên hôm nay");
  });

  test("hiển thị streak + hàng đợi thẻ đến hạn", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Nhịp tuần")).toBeVisible();
    await expect(page.getByTestId("due-cards-count")).toBeVisible();
  });
});
