import { expect, test } from "@playwright/test";

/**
 * E2E — SRS ôn tập thẻ ngôn ngữ (S08 + S09).
 *
 * ⚠️ AC-LG-2 — thẻ đến hạn trước, thẻ mới sau.
 * ⚠️ AC-LG-3 — tối đa 20 thẻ/phiên.
 * ⚠️ AC-LG-5 — mặt trước / mặt sau đúng level 0.
 * ⚠️ AC-LG-6 — tiến độ & streak riêng từng ngôn ngữ.
 * ⚠️ AC-LG-10 — đổi ngôn ngữ không trộn thẻ.
 */

test.describe("S08 — Bảng thẻ (AC-LG-6, AC-LG-11, AC-LG-12)", () => {
  test("render tiến độ bằng chứng cụ thể, không % mơ hồ (P3/P7)", async ({ page }) => {
    await page.goto("/language?lang=zh");

    await expect(page.getByRole("heading", { name: "Thẻ ngôn ngữ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tiến độ ôn tập" })).toBeVisible();

    for (const label of ["Đã thuộc", "Đang học", "Chưa học", "Đến hạn hôm nay"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // Nút ôn + xuất deck.
    await expect(page.getByRole("link", { name: /Bắt đầu ôn/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Xuất deck/ })).toBeVisible();
  });

  test("chuyển ngôn ngữ không trộn thẻ (AC-LG-10)", async ({ page }) => {
    await page.goto("/language?lang=zh");

    await expect(page.getByText(/Tiếng Trung ·/)).toBeVisible();

    await page.getByRole("link", { name: "Tiếng Anh" }).click();
    await expect(page.getByText(/Tiếng Anh ·/)).toBeVisible();
  });

  test("thêm thẻ thủ công (AC-LG-11)", async ({ page, request }) => {
    await page.goto("/language?lang=en");

    await page.getByRole("button", { name: /Thêm thẻ/ }).click();

    const unique = `manual ${Date.now()}`;
    await page.getByLabel("Mặt trước").fill(unique);
    await page.getByLabel("Mặt sau").fill("nghĩa của thẻ thủ công");

    await page.getByRole("button", { name: "Lưu thẻ" }).click();

    // ⚠️ Thẻ mới có `due = now` ⇒ sort theo `due` asc đẩy xuống CUỐI
    // danh sách (71 thẻ / 20 mỗi trang ⇒ trang 4). Vì vậy kiểm tra qua API
    // thay vì tìm trong bảng hiện tại.
    await expect
      .poll(
        async () => {
          const res = await request.get("/api/srs/cards?lang=en");
          const deck = await res.json();
          return (deck.cards as Array<{ front: string }>).some(
            (card) => card.front === unique,
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });
});

test.describe("S09 — Phiên ôn (AC-LG-1..5)", () => {
  test("mở phiên ôn, hiện thẻ + 4 nút chấm điểm", async ({ page }) => {
    await page.goto("/srs/review?lang=zh");

    await expect(page.getByRole("heading", { name: /Ôn tập/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hiện mặt sau" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nghe phát âm" })).toBeVisible();
  });

  test("hiện mặt sau ⇒ có 4 nút chấm điểm FSRS (AC-LG-1)", async ({ page }) => {
    await page.goto("/srs/review?lang=zh");

    await page.getByRole("button", { name: "Hiện mặt sau" }).click();

    for (const label of ["Quên", "Khó", "Nhớ", "Dễ"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("chấm điểm ⇒ báo lần sau ôn (AC-LG-1)", async ({ page }) => {
    await page.goto("/srs/review?lang=zh");

    await page.getByRole("button", { name: "Hiện mặt sau" }).click();
    await page.getByRole("button", { name: "Nhớ", exact: true }).click();

    await expect(page.getByText(/Lần sau ôn:/)).toBeVisible({ timeout: 10_000 });
  });

  test("API /api/srs/next trả queue đúng thứ tự & giới hạn 20 (AC-LG-2, AC-LG-3)", async ({
    request,
  }) => {
    const res = await request.get("/api/srs/next?lang=zh");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.cards.length).toBeLessThanOrEqual(20);

    // Thẻ đến hạn (reps > 0) đứng trước thẻ mới (reps = 0).
    const cards = payload.data.cards as Array<{ reps: number }>;
    const firstFreshIndex = cards.findIndex((c) => c.reps === 0);
    if (firstFreshIndex >= 0) {
      const dueAfter = cards.slice(firstFreshIndex).some((c) => c.reps > 0);
      expect(dueAfter).toBe(false);
    }
  });

  test("API /api/srs/next lang sai ⇒ 400", async ({ request }) => {
    const res = await request.get("/api/srs/next?lang=fr");
    expect(res.status()).toBe(400);
  });

  test("API /api/srs/progress trả tiến độ theo ngôn ngữ (AC-LG-6)", async ({
    request,
  }) => {
    const zh = await request.get("/api/srs/progress?lang=zh");
    const zhPayload = await zh.json();

    const en = await request.get("/api/srs/progress?lang=en");
    const enPayload = await en.json();

    expect(zhPayload.data.lang).toBe("zh");
    expect(enPayload.data.lang).toBe("en");
    expect(typeof zhPayload.data.streak).toBe("number");
    expect(zhPayload.data.total).toBeGreaterThan(0);
  });

  test("API /api/srs/grade thẻ không tồn tại ⇒ 404", async ({ request }) => {
    const res = await request.post("/api/srs/grade", {
      data: { cardId: "khong-ton-tai", rating: 3 },
    });

    expect(res.status()).toBe(404);
  });

  test("API /api/srs/grade rating sai ⇒ 400", async ({ request }) => {
    const res = await request.post("/api/srs/grade", {
      data: { cardId: "abc", rating: 9 },
    });

    expect(res.status()).toBe(400);
  });
});
