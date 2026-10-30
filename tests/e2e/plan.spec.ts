/**
 * E2E — S02 sinh kế hoạch AI + apply (task 6.5 · FR-DL-06).
 *
 * FR-DL-06: "Lập lại kế hoạch hôm nay → AI sinh lại 6 hành động, **giữ nguyên
 * hành động đã xong**". Đây là test bảo vệ đúng hành vi đó.
 *
 * Kiểm chứng:
 *   1. Bấm "Sinh lại toàn bộ (AI)" → diff view hiện **6 dòng** (6 slot cố định).
 *   2. Bấm "Áp dụng" → toast báo đã ghi N slot; DB có **6** `PlanItem` hôm nay.
 *   3. Slot đã `done` **vẫn `done`** và nội dung **không bị ghi đè** (FR-DL-06).
 *   4. Quay lại S01 → 6 slot hiện đủ; slot đã xong render badge "Đã xong".
 *
 * ⚠️ Test chạy được **hoàn toàn offline**: `/api/plan/generate` luôn có
 * fallback chain `anthropic → local → rule cục bộ` (design.md §6.2) nên khi
 * không có API key / Ollama vẫn trả về đúng 6 slot hợp lệ.
 */

import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/db-test";
import { startOfDay } from "../../src/lib/dates";

const today = () => startOfDay(new Date());

/** Nội dung riêng của slot đã xong — dùng để chứng minh KHÔNG bị ghi đè. */
const DONE_ACTION = "Hành động đã xong từ trước";

/**
 * Xoá kế hoạch hôm nay rồi tạo 1 slot `done = true` ở slot 0.
 *
 * Đây là tiền đề của FR-DL-06: khi AI sinh lại kế hoạch, slot đã hoàn thành
 * phải được giữ nguyên.
 */
async function seedDoneSlot() {
  const day = today();
  await prisma.planItem.deleteMany({ where: { date: day } });
  return prisma.planItem.create({
    data: {
      date: day,
      slot: 0,
      domain: "professional",
      action: DONE_ACTION,
      detail: "Giữ nguyên khi AI sinh lại kế hoạch.",
      minutes: 30,
      done: true,
      source: "manual",
    },
  });
}

test.describe("S02 — sinh kế hoạch AI & apply", () => {
  test.beforeEach(async () => {
    await seedDoneSlot();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("sinh kế hoạch → diff view hiện 6 dòng, slot đã xong được giữ", async ({ page }) => {
    await page.goto("/plan");

    await page.getByTestId("generate-plan").click();

    // Diff view xuất hiện sau khi AI (hoặc rule cục bộ) trả 6 slot.
    const diff = page.getByTestId("plan-diff");
    await expect(diff).toBeVisible({ timeout: 60_000 });
    await expect(diff.locator("li")).toHaveCount(6);

    // Slot đã `done` → nhãn diff "Đã xong — giữ" (không phải "Sửa"/"Mới").
    const firstRow = diff.locator("li").first();
    await expect(firstRow).toContainText("Đã xong — giữ");
    await expect(firstRow).toContainText(DONE_ACTION);

    // Panel thông tin AI hiện provider thật (offline → badge rule cục bộ).
    await expect(page.getByText(/Lượt gọi gần nhất/)).toBeVisible();
  });

  test("apply → DB có 6 slot hôm nay, slot đã xong vẫn done", async ({ page }) => {
    await page.goto("/plan");

    await page.getByTestId("generate-plan").click();
    await expect(page.getByTestId("plan-diff")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("apply-plan").click();

    // Toast báo số slot đã ghi (task 6.4).
    await expect(
      page.getByText(/Đã ghi \d+ slot vào kế hoạch hôm nay/).first(),
    ).toBeVisible({ timeout: 60_000 });

    // DB: đủ 6 slot hôm nay.
    await expect
      .poll(
        async () => prisma.planItem.count({ where: { date: today() } }),
        { timeout: 15_000 },
      )
      .toBe(6);

    // FR-DL-06: slot đã xong GIỮ NGUYÊN — cả `done` lẫn nội dung.
    const slot0 = await prisma.planItem.findFirst({ where: { date: today(), slot: 0 } });
    expect(slot0).not.toBeNull();
    expect(slot0?.done).toBe(true);
    expect(slot0?.action).toBe(DONE_ACTION);

    // 5 slot còn lại phải là slot MỚI (chưa xong) — AI không được ghi đè
    // slot đã xong và cũng không được bỏ sót slot nào.
    const others = await prisma.planItem.findMany({
      where: { date: today(), slot: { gt: 0 } },
    });
    expect(others).toHaveLength(5);
    for (const item of others) {
      expect(item.done).toBe(false);
    }
  });

  test("apply xong → S01 hiện 6 slot mới, slot đã xong vẫn hiện 'Đã xong'", async ({ page }) => {
    await page.goto("/plan");

    await page.getByTestId("generate-plan").click();
    await expect(page.getByTestId("plan-diff")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("apply-plan").click();
    await expect(
      page.getByText(/Đã ghi \d+ slot vào kế hoạch hôm nay/).first(),
    ).toBeVisible({ timeout: 60_000 });

    // ── Quay lại S01 ────────────────────────────────────────────────────
    await page.goto("/");

    const slots = page.getByTestId(/^slot-\d+$/);
    await expect(slots).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) {
      await expect(page.getByTestId(`slot-${i}`)).toBeVisible();
    }

    // Slot 0 đã xong → gạch ngang + badge "Đã xong" + nút bị disable.
    const slot0 = page.getByTestId("slot-0");
    await expect(slot0).toHaveAttribute("data-done", "true");
    await expect(slot0).toContainText("Đã xong");
    await expect(page.getByTestId("slot-title-0")).toHaveClass(/line-through/);
    await expect(page.getByTestId("slot-done-0")).toBeDisabled();

    // Nội dung của slot đã xong không bị AI ghi đè.
    await expect(page.getByTestId("slot-title-0")).toHaveText(DONE_ACTION);

    // 5 slot còn lại chưa xong.
    await expect(page.getByTestId("slot-1")).toHaveAttribute("data-done", "false");
    await expect(page.getByTestId("slot-5")).toHaveAttribute("data-done", "false");
  });

  test("AI không có sẵn → vẫn sinh được 6 slot bằng rule cục bộ (offline-safe)", async ({
    request,
  }) => {
    const response = await request.post("/api/plan/generate", { data: { apply: false } });
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as {
      ok: boolean;
      data: { slots: Array<{ slot: number; domain: string; action: string }>; meta: { provider: string } };
    };

    expect(body.ok).toBe(true);
    expect(body.data.slots).toHaveLength(6);

    // Cấu trúc 6 slot cố định (SPEC.md §2.1) — domain không đổi theo slot.
    expect(body.data.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(body.data.slots.map((s) => s.domain)).toEqual([
      "professional",
      "communication",
      "language",
      "language",
      "personal",
      "personal",
    ]);

    // Provider thật: anthropic (online) hoặc local (offline) — không bao giờ
    // trả lỗi trần cho UI (design.md §7.2).
    expect(["anthropic", "local"]).toContain(body.data.meta.provider);
  });
});
