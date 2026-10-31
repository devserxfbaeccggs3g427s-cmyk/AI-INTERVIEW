import { expect, test } from "@playwright/test";

/**
 * E2E — Nhật ký & phản hồi AI (S06) + Đánh giá chính (S12).
 *
 * ⚠️ FR-PS-07 — dữ liệu cá nhân không rời máy: nếu không có API key thì
 * **không** có nút AI và **không** giả lập phản hồi.
 *
 * ⚠️ P3 — bản nháp KHÔNG tính vào thống kê hoạt động; chỉ commit mới tạo
 * `Activity`.
 */

test.describe("S06 — Nhật ký (FR-PSJ-01..06)", () => {
  test("mở trang nhật ký, có ô nhập + 3 câu hỏi gợi ý", async ({ page }, _testInfo) => {
    await page.goto("/journal");

    await expect(page.getByRole("heading", { name: "Nhật ký" })).toBeVisible();
    await expect(page.getByPlaceholder(/Bạn nghĩ gì hôm nay/)).toBeVisible();

    // 3 chip gợi ý câu hỏi.
    const chips = page.locator("button", { hasText: "?" });
    expect(await chips.count()).toBeGreaterThanOrEqual(3);
  });

  test("bản nháp tự lưu cục bộ sau 800ms ngừng gõ (FR-PSJ-01)", async ({ page }, testInfo) => {
    await page.goto("/journal");

    const textarea = page.getByPlaceholder(/Bạn nghĩ gì hôm nay/);
    await textarea.fill(`Bản nháp tự lưu ${testInfo.project.name} ${Date.now()}`);

    // Đợi autosave.
    await expect(page.getByText(/Đã lưu cục bộ lúc/)).toBeVisible({ timeout: 10_000 });
  });

  test("bản nháp KHÔNG tính vào thống kê (P3)", async ({ page }, testInfo) => {
    await page.goto("/journal");

    const textarea = page.getByPlaceholder(/Bạn nghĩ gì hôm nay/);
    await textarea.fill(`Bản nháp chưa commit ${testInfo.project.name} ${Date.now()}`);

    await expect(page.getByText(/Bản nháp chưa tính vào thống kê/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu vào lịch sử" })).toBeVisible();
  });

  test("không có API key ⇒ ẩn nút AI, hiện hướng dẫn (FR-PSJ-05)", async ({ page }, _testInfo) => {
    await page.goto("/journal");

    // ⚠️ Không giả lập phản hồi AI — phải nói rõ là chỉ lưu cục bộ.
    await expect(page.getByText(/chỉ lưu cục bộ/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Gửi AI phản hồi/ })).toHaveCount(0);
  });

  test("bấm chip gợi ý ⇒ chèn câu hỏi vào cuối textarea (FR-PSJ-02)", async ({
    page,
  }, _testInfo) => {
    await page.goto("/journal");

    const textarea = page.getByPlaceholder(/Bạn nghĩ gì hôm nay/);
    await textarea.fill("Ghi chú của tôi:");

    const chip = page.locator("button", { hasText: "?" }).first();
    const questionText = (await chip.innerText()).trim();

    await chip.click();

    await expect(textarea).toHaveValue(
      new RegExp(questionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  test("API lưu bản nháp — status = draft, không tạo Activity", async ({ request }, testInfo) => {
    const res = await request.post("/api/journal", {
      data: { answer: `Journal API test ${testInfo.project.name} ${Date.now()}` },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    // ⚠️ P3 — bản nháp chưa phải hoạt động.
    expect(payload.data.status).toBe("draft");
    expect(payload.data.activityId).toBeNull();
    // Không có phản hồi AI khi chưa bấm nút.
    expect(payload.data.aiSummary).toBeNull();
    expect(payload.data.aiQuestion).toBeNull();
  });

  test("commit nhật ký ⇒ status = published + có activityId", async ({ request }, testInfo) => {
    const created = await request.post("/api/journal", {
      data: { answer: `Journal commit test ${testInfo.project.name} ${Date.now()}` },
    });
    const createdBody = await created.json();
    const id = createdBody.data.id;

    expect(createdBody.data.status).toBe("draft");

    const committed = await request.patch(`/api/journal/${id}`, {
      data: { action: "commit" },
    });

    expect(committed.status()).toBe(200);
    const payload = await committed.json();
    expect(payload.data.status).toBe("published");
    expect(payload.data.activityId).toBeTruthy();
  });

  test("commit 2 lần ⇒ idempotent, không tạo 2 Activity (P3)", async ({ request }, testInfo) => {
    const created = await request.post("/api/journal", {
      data: { answer: `Journal idempotent ${testInfo.project.name} ${Date.now()}` },
    });
    const createdBody = await created.json();
    const id = createdBody.data.id;

    const first = await request.patch(`/api/journal/${id}`, {
      data: { action: "commit" },
    });
    const firstBody = await first.json();

    const second = await request.patch(`/api/journal/${id}`, {
      data: { action: "commit" },
    });
    const secondBody = await second.json();

    expect(secondBody.data.activityId).toBe(firstBody.data.activityId);
  });

  test("API phản hồi AI không có key ⇒ 503 no_api_key, KHÔNG giả lập (FR-PSJ-05)", async ({
    request,
  }, testInfo) => {
    const created = await request.post("/api/journal", {
      data: { answer: `Journal no-key ${testInfo.project.name} ${Date.now()}` },
    });
    const createdBody = await created.json();

    const res = await request.post("/api/journal/feedback-ai", {
      data: { reflectionId: createdBody.data.id, consent: true },
    });

    expect(res.status()).toBe(503);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("no_api_key");
  });

  test("thiếu consent ⇒ 401 consent_required, KHÔNG gọi SDK (FR-PSJ-03)", async ({
    request,
  }, testInfo) => {
    const created = await request.post("/api/journal", {
      data: { answer: `Journal consent ${testInfo.project.name} ${Date.now()}` },
    });
    const createdBody = await created.json();

    const res = await request.post("/api/journal/feedback-ai", {
      data: { reflectionId: createdBody.data.id },
    });

    expect(res.status()).toBe(401);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("consent_required");
  });

  test("phân loại cục bộ ⇒ source = local, không gọi AI (RB-03)", async ({
    request,
  }, testInfo) => {
    const created = await request.post("/api/journal", {
      data: { answer: `Hôm nay học Java Spring Boot API ${testInfo.project.name} ${Date.now()}` },
    });
    const createdBody = await created.json();

    const res = await request.post("/api/journal/classify", {
      data: { reflectionId: createdBody.data.id },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    // ⚠️ Luôn "local" — UI không được ghi "AI".
    expect(payload.data.source).toBe("local");
    expect(payload.data.domain).toBe("chuyên_môn");
  });
});

test.describe("S12 — Đánh giá chính (FR-PS-01, FR-PS-05..07)", () => {
  test("render 4 chỉ số + nút lưu + biểu đồ + phân tích tương quan", async ({
    page,
  }, _testInfo) => {
    await page.goto("/state");

    await expect(page.getByRole("heading", { name: "Đánh giá chính" })).toBeVisible();

    for (const label of ["Tâm trạng", "Năng lượng", "Giấc ngủ", "Tập trung"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByRole("button", { name: "Lưu chỉ số" })).toBeVisible();
    await expect(page.getByText("Diễn biến theo ngày")).toBeVisible();
    await expect(page.getByText("Phân tích tương quan")).toBeVisible();
  });

  test("toggle 7 ngày / 30 ngày (FR-PSJ-09)", async ({ page }, _testInfo) => {
    await page.goto("/state");

    const group = page.getByRole("group", { name: "Khoảng thời gian" });
    await expect(group.getByRole("button", { name: "7 ngày" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await group.getByRole("button", { name: "30 ngày" }).click();
    await expect(group.getByRole("button", { name: "30 ngày" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("ghi chỉ số qua API — upsert theo ngày (FR-PSJ-08)", async ({ request }, _testInfo) => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const first = await request.put("/api/state", {
      data: { date: dateKey, mood: 3, energy: 3, sleep: 6, focus: 3 },
    });
    expect(first.status()).toBe(200);

    // Ghi lần 2 ⇒ vẫn 1 bản ghi, giá trị mới thay.
    const second = await request.put("/api/state", {
      data: { date: dateKey, mood: 5, energy: 4, sleep: 8, focus: 5 },
    });
    const payload = await second.json();
    expect(payload.data.mood).toBe(5);
    expect(payload.data.sleep).toBe(8);
  });

  test("API correlation chạy cục bộ, không gọi AI (FR-PS-05, FR-PS-07)", async ({
    request,
  }, _testInfo) => {
    const res = await request.get("/api/state/correlation?days=30");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.correlations).toHaveLength(4);

    for (const item of payload.data.correlations) {
      expect(item.insight.length).toBeGreaterThan(0);
      expect(typeof item.samples).toBe("number");
    }
  });

  test("trạng thái thiếu dữ liệu hiện 'Chưa đủ dữ liệu' chứ không vẽ số 0", async ({
    request,
  }, _testInfo) => {
    const res = await request.get("/api/state/correlation?days=7");
    const payload = await res.json();

    // Với dữ liệu ít, phải nói rõ chưa đủ dữ liệu.
    const sleep = payload.data.correlations.find(
      (item: { metric: string }) => item.metric === "sleep",
    );
    expect(sleep.samples).toBeLessThan(3);
    expect(sleep.insight).toContain("Chưa đủ dữ liệu");
  });
});
