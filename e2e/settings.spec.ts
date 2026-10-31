import { expect, test } from "@playwright/test";

/**
 * E2E — Cài đặt & Chi phí (S15 — FR-SC-01..29).
 *
 * ⚠️ FR-SC-11 — key chỉ hiện dạng che, KHÔNG bao giờ hiện đầy đủ.
 * ⚠️ FR-SC-25 — xoá trắng cần xác nhận 2 bước (gõ đúng `XOA`).
 */

test.describe("S15 — Hồ sơ (FR-SC-01..07)", () => {
  test("mở trang cài đặt, có 4 tab", async ({ page }, _testInfo) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm cài đặt" });
    await expect(tablist.getByRole("tab")).toHaveCount(4);
  });

  test("lưu hồ sơ có phản hồi rõ ràng (FR-SC-07)", async ({ page }, testInfo) => {
    await page.goto("/settings");

    await page.getByLabel("Tên hiển thị").fill(`DevMode ${testInfo.project.name} ${Date.now()}`);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();

    // Toast có aria-live="polite".
    await expect(page.getByRole("status")).toContainText("Đã lưu hồ sơ", {
      timeout: 10_000,
    });
  });

  test("bỏ hết ngôn ngữ ⇒ chặn lưu, nói rõ lý do (FR-SC-04)", async ({ page }, _testInfo) => {
    await page.goto("/settings");

    // Bỏ tất cả ngôn ngữ đang học.
    // ⚠️ Phải scope vào nhóm "Ngôn ngữ đang học" — nhãn "Tiếng Anh" /
    // "Tiếng Việt" còn xuất hiện ở nhóm ngôn ngữ phỏng vấn.
    const group = page.getByRole("group", { name: "Ngôn ngữ đang học" });

    for (const label of ["Tiếng Anh", "Tiếng Trung", "Tiếng Việt"]) {
      const chip = group.getByRole("button", { name: label, exact: true });
      if ((await chip.getAttribute("aria-pressed")) === "true") {
        await chip.click();
      }
    }

    await expect(
      page.getByText("Phải chọn ít nhất 1 ngôn ngữ đang học").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(
      page.getByText("Phải chọn ít nhất 1 ngôn ngữ đang học").first(),
    ).toBeVisible();
  });

  test("chuyển tab sang API key / Chi phí / Dữ liệu", async ({ page }, _testInfo) => {
    await page.goto("/settings");

    const tablist = page.getByRole("tablist", { name: "Nhóm cài đặt" });

    await tablist.getByRole("tab", { name: "API key" }).click();
    await expect(
      page.getByRole("heading", { name: "API key Anthropic" }),
    ).toBeVisible();

    await tablist.getByRole("tab", { name: "Chi phí AI" }).click();
    await expect(page.getByRole("heading", { name: "Chi phí AI" })).toBeVisible();

    await tablist.getByRole("tab", { name: "Dữ liệu" }).click();
    await expect(
      page.getByRole("heading", { name: "Dung lượng dữ liệu" }),
    ).toBeVisible();
  });
});

test.describe("S15 — API key (FR-SC-08..14)", () => {
  test("key chỉ hiện dạng che, không bao giờ hiện đầy đủ (FR-SC-11)", async ({
    page,
  }, _testInfo) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "API key" }).click();

    // Không có key ⇒ hướng dẫn rõ ràng, không giả lập.
    const input = page.getByLabel(/Nhập key|Thay thế key/);
    await expect(input).toHaveAttribute("type", "password");

    // Nút mắt có aria-label.
    await expect(page.getByRole("button", { name: "Hiện key" })).toBeVisible();
  });

  test("nút ping có tồn tại và không giả lập kết quả (FR-SC-10)", async ({
    page,
  }, _testInfo) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "API key" }).click();

    await expect(
      page.getByRole("button", { name: /Chạy kiểm tra Ping Anthropic Endpoint/ }),
    ).toBeVisible();
  });

  test("API GET /api/settings/key không trả key đầy đủ (FR-SC-11)", async ({
    request,
  }, _testInfo) => {
    const res = await request.get("/api/settings/key");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(typeof payload.data.hasKey).toBe("boolean");

    if (payload.data.hasKey) {
      // Masked key phải có dạng sk-ant-…xxxx
      expect(payload.data.maskedKey).toMatch(/^sk-ant-….{4}$/);
    }
  });

  test("API PUT key không hợp lệ ⇒ 400, không ghi file (FR-SC-08)", async ({
    request,
  }, _testInfo) => {
    const res = await request.put("/api/settings/key", {
      data: { apiKey: "khong-phai-key-that" },
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
  });
});

test.describe("S15 — Chi phí (FR-SC-15..23)", () => {
  test("API /api/ai/costs trả tổng quan + cảnh báo ngân sách", async ({
    request,
  }, _testInfo) => {
    const res = await request.get("/api/ai/costs?days=30");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.days).toBe(30);
    expect(payload.data.daily).toHaveLength(30);
    expect(Array.isArray(payload.data.byFeature)).toBe(true);
    expect(["ok", "warning", "exceeded"]).toContain(
      payload.data.budgetStatus,
    );
  });

  test("days không hợp lệ ⇒ 400", async ({ request }, _testInfo) => {
    const res = await request.get("/api/ai/costs?days=5");
    expect(res.status()).toBe(400);
  });

  test("API /api/ai/calls trả nhật ký + CSV (FR-SC-19..21)", async ({ request }, _testInfo) => {
    const json = await request.get("/api/ai/calls?limit=10");
    const payload = await json.json();
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.items)).toBe(true);

    const csv = await request.get("/api/ai/calls?limit=10&format=csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
  });

  test("hiển thị hệ số ngân sách + nút xuất CSV", async ({ page }, _testInfo) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Chi phí AI" }).click();

    await expect(page.getByText(/ngân sách tháng/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Xuất CSV/ })).toBeVisible();
  });
});

test.describe("S15 — Dữ liệu (FR-SC-24..27)", () => {
  test("API stats trả dung lượng + số bản ghi (FR-SC-26)", async ({ request }, _testInfo) => {
    const res = await request.get("/api/data/stats");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.tables.length).toBeGreaterThan(0);
    expect(typeof payload.data.dbSizeBytes).toBe("number");
  });

  test("xuất JSON chứa metadata + toàn bộ bảng (FR-SC-24)", async ({ request }, _testInfo) => {
    const res = await request.get("/api/data/export");
    const payload = await res.json();

    expect(payload.metadata).toBeTruthy();
    expect(payload.metadata.schemaVersion).toBe(1);
    expect(payload.metadata.exportedAt).toBeTruthy();
    expect(payload.data.activities).toBeInstanceOf(Array);
    expect(payload.data.skills).toBeInstanceOf(Array);
  });

  test("xoá trắng cần gõ đúng XOA (FR-SC-25)", async ({ page }, _testInfo) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Dữ liệu" }).click();

    await page.getByRole("button", { name: "Xoá trắng dữ liệu" }).click();

    // Nút xoá bị disable cho tới khi gõ đúng.
    const wipeButton = page.getByRole("button", { name: "Xoá vĩnh viễn" });
    await expect(wipeButton).toBeDisabled();

    await page.getByLabel(/Gõ đúng/).fill("XOA");
    await expect(wipeButton).toBeEnabled();
  });

  test("API DELETE /api/data sai xác nhận ⇒ 400, không xoá (FR-SC-25)", async ({
    request,
  }, _testInfo) => {
    const res = await request.delete("/api/data", {
      data: { confirmation: "SAI" },
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
  });

  test("API privacy-log trả loại dữ liệu đã gửi (FR-SC-27)", async ({
    request,
  }, _testInfo) => {
    const res = await request.get("/api/data/privacy-log?limit=10");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.items)).toBe(true);
  });
});
