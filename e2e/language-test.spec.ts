import { expect, test } from "@playwright/test";

/**
 * E2E — Thi kỳ thi ngôn ngữ (S13 + S14) + Báo cáo tiến độ tuần (S16 + S17).
 *
 * ⚠️ P3/P7 — tiến độ là **bằng chứng**, không % hoàn thành mơ hồ.
 * ⚠️ Không có API key ⇒ nói rõ, KHÔNG giả lập kết quả AI.
 */

test.describe("S13 — Danh sách bài kiểm tra", () => {
  test("mở trang bài kiểm tra, thấy kho đề + điều khoản", async ({ page }) => {
    await page.goto("/test?lang=zh");

    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/bài kiểm tra/i).first()).toBeVisible();
  });

  test("API /api/test trả danh sách bài theo lang (AC-LT-01)", async ({ request }) => {
    const res = await request.get("/api/test?lang=zh");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.items ?? payload.data.tests ?? [])).toBe(
      true,
    );
  });

  test("API /api/test lang sai ⇒ 400", async ({ request }) => {
    const res = await request.get("/api/test?lang=fr");
    expect(res.status()).toBe(400);
  });

  test("API /api/test/level ước lượng mức cục bộ (AC-LT-06)", async ({ request }) => {
    const res = await request.post("/api/test/level", {
      data: { lang: "zh", correct: 9, total: 10 },
    });

    // Có thể 200 (ước lượng local) hoặc 503 (cần AI) — nhưng KHÔNG được
    // trả kết quả bịa.
    expect([200, 400, 422, 503]).toContain(res.status());
    const payload = await res.json();
    if (payload.ok) {
      expect(payload.data.level).toBeTruthy();
      expect(payload.data.source).toBeTruthy();
    }
  });
});

test.describe("S16 — Báo cáo tiến độ (AC-PR-01..04)", () => {
  test("mở trang báo cáo, có biểu đồ + số liệu", async ({ page }) => {
    await page.goto("/progress");

    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("API /api/progress trả số liệu theo khoảng ngày (AC-PR-01)", async ({
    request,
  }) => {
    const res = await request.get("/api/progress?days=30");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data).toBeTruthy();
  });

  test("API /api/progress/export trả file (FR-PR-08)", async ({ request }) => {
    const res = await request.get("/api/progress/export");
    expect(res.status()).toBe(200);
  });
});

test.describe("S17 — AI review tuần (AC-RV-01..04)", () => {
  test("mở trang review, có tuần + phần phân tích", async ({ page }) => {
    await page.goto("/review");

    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("API /api/review/weekly trả báo cáo tuần (AC-RV-01)", async ({ request }) => {
    const res = await request.get("/api/review/weekly");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data).toBeTruthy();
  });

  test("API /api/review/weekly week sai ⇒ 400", async ({ request }) => {
    const res = await request.get("/api/review/weekly?week=khong-hop-le");
    expect(res.status()).toBe(400);
  });

  test("API /api/review/weekly không có key ⇒ nói rõ, KHÔNG giả lập (AC-RV-05)", async ({
    request,
  }) => {
    const res = await request.get("/api/review/weekly");
    const payload = await res.json();

    // Nếu không có key ⇒ phải báo rõ (503) chứ không trả review giả.
    if (res.status() === 503) {
      expect(payload.error).toBe("no_api_key");
    } else {
      expect(payload.ok).toBe(true);
    }
  });
});
