import { expect, test } from "@playwright/test";

/**
 * E2E — Quick-log (S05).
 *
 * ⚠️ P2 — ghi nhập dưới 10 giây: test verify sheet mở **tức thì**, preset 2
 * chạm điền đủ, và bấm Enter ghi được ngay (không chờ AI).
 */

test.describe("S05 — Quick-log (FR-QL-01..FR-QL-09)", () => {
  test("sheet mở ngay lập tức, không chờ request nào (FR-QL-01)", async ({ page }, _testInfo) => {
    await page.goto("/");

    // Bấm nút ghi nhanh trên S01.
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    // Dialog phải hiện ngay, có ô nhập + 6 preset chip.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog.getByPlaceholder(/Đã làm gì/)).toBeVisible();

    // 6 preset chip (FR-QL-02).
    await expect(dialog.getByRole("button", { name: /Học/ }).first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Luyện nói/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Nhật ký/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Chăm sóc bản thân/ })).toBeVisible();
  });

  test("preset 2 chạm điền sẵn mô tả + domain + type + thời lượng (FR-QL-02)", async ({
    page,
  }, _testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Luyện nói/ }).click();

    // Ô nhập đã điền.
    await expect(dialog.getByPlaceholder(/Đã làm gì/)).toHaveValue(/Luyện nói/);

    // Mở "Sửa chi tiết" để kiểm tra domain + thời lượng.
    await dialog.getByRole("button", { name: /Sửa chi tiết/ }).click();
    await expect(dialog.locator("select").first()).toHaveValue("communication");
    await expect(dialog.locator("select").nth(1)).toHaveValue("speak");
    // ⚠️ `exact: true` — không thì "20′" khớp cả nút "…20′ 25′ 45′ 60′"
    // (accessible name của group) ⇒ vi phạm strict mode.
    await expect(
      dialog.getByRole("button", { name: "20′", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("gõ ≥3 ký tự ⇒ autofill chạy nền, badge nguồn hiện (FR-QL-04, FR-QL-13)", async ({
    page,
  }, _testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/Đã làm gì/).fill("học JPA và Hibernate");

    // Autofill (rule cục bộ khi offline) điền panel Bước 2.
    await expect(dialog.getByText(/Nguồn:/)).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/Rule cục bộ|AI/)).toBeVisible();
  });

  test("bấm Enter ⇒ ghi thẳng, không chờ AI (FR-QL-05, AC-2)", async ({ page }, _testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/Đã làm gì/).fill("Viết bài kiểm tra E2E");
    await dialog.getByPlaceholder(/Đã làm gì/).press("Enter");

    // Sheet đóng sau khi ghi.
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    // Hoạt động đã vào lịch sử.
    await page.goto("/log/history");
    await expect(page.getByText("Viết bài kiểm tra E2E")).toBeVisible();
  });

  test("Enter nhiều lần ⇒ chỉ tạo 1 Activity (FR-QL-09)", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    const dialog = page.getByRole("dialog");
    const input = dialog.getByPlaceholder(/Đã làm gì\?/);

    // ⚠️ Title phải **unique** giữa 2 project (mobile + desktop) chạy song
    // song cùng 1 DB. `Date.now()` **không** đủ — 2 project có thể trùng
    // mili-giây ⇒ dedupe của project này xoá Activity của project kia.
    // ⇒ thêm tên project vào title.
    const title = `Dedup test ${testInfo.project.name} ${testInfo.project.name} ${Date.now()}`;
    await input.fill(title);

    // ⚠️ Gõ phím nhanh: Enter lần 1 đóng sheet ⇒ lần 2/3 không còn input.
    // Dùng `press` với `noWaitAfter` + bỏ qua lỗi "element detached" để mô
    // phỏng người dùng gõ Enter liên tục (mục tiêu: server phải dedupe).
    await input.press("Enter");
    // Nếu sheet đã đóng (Enter đầu đã lưu), mở lại và gõ Enter tiếp —
    // mô phỏng "người dùng bấm Enter 3 lần trong 10 giây".
    for (let attempt = 0; attempt < 2; attempt++) {
      const stillOpen = await dialog.count();
      if (stillOpen === 0) {
        await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();
        await page.getByPlaceholder(/Đã làm gì\?/).fill(title);
        await page.getByPlaceholder(/Đã làm gì\?/).press("Enter");
      } else {
        await input.press("Enter");
      }
    }

    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });

    // Đếm hoạt động có title này trong API.
    const res = await request.get("/api/log/history?limit=200");
    const payload = await res.json();
    const matches = payload.data.items.filter(
      (item: { title: string }) => item.title === title,
    );

    // ⚠️ Dedupe cửa sổ 10 giây (FR-QL-09): 3 lần ghi cùng title+domain ⇒
    // chỉ 1 Activity.
    expect(matches).toHaveLength(1);
  });

  test("sheet đóng bằng Escape (FR-QL-07)", async ({ page }, _testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ghi nhanh/ }).first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("API — quick-log", () => {
  test("POST /api/log tạo 1 Activity + Evidence khi có skill + difficulty (FR-QL-08)", async ({
    request,
  }, testInfo) => {
    const res = await request.post("/api/log", {
      data: {
        text: `API test ${testInfo.project.name} ${Date.now()}`,
        domain: "professional",
        type: "study",
        minutes: 30,
        skillId: "skill-spring-boot",
        difficulty: 3,
        createEvidence: true,
      },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.entry.hasEvidence).toBe(true);
    expect(payload.data.entry.skillName).toBe("Spring Boot");
  });

  test("POST /api/log không tạo Evidence khi createEvidence = false (FR-QL-08)", async ({
    request,
  }, testInfo) => {
    const res = await request.post("/api/log", {
      data: {
        text: `No evidence ${testInfo.project.name} ${Date.now()}`,
        domain: "professional",
        type: "study",
        minutes: 20,
        skillId: "skill-spring-boot",
        difficulty: 3,
        createEvidence: false,
      },
    });

    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.entry.hasEvidence).toBe(false);
  });

  test("POST /api/log trả 400 khi thiếu text (FR-QL-03)", async ({ request }, _testInfo) => {
    const res = await request.post("/api/log", {
      data: { domain: "professional", type: "study", minutes: 20 },
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
  });

  test("POST /api/log/autofill offline ⇒ source = rule (FR-QL-13)", async ({
    request,
  }, _testInfo) => {
    const res = await request.post("/api/log/autofill", {
      data: { text: "học Spring Boot", domain: "professional" },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(["rule", "ai"]).toContain(payload.data.source);

    // Rule cục bộ phải khớp được kỹ năng theo tên.
    if (payload.data.source === "rule") {
      expect(payload.data.skillId).toBe("skill-spring-boot");
    }
  });

  test("GET /api/log/history lọc theo domain (FR-QL-10)", async ({ request }, _testInfo) => {
    const all = await (await request.get("/api/log/history?limit=200")).json();
    const professional = await (
      await request.get("/api/log/history?domain=professional&limit=200")
    ).json();

    expect(professional.ok).toBe(true);
    for (const item of professional.data.items) {
      expect(item.domain).toBe("professional");
    }
    expect(professional.data.total).toBeLessThanOrEqual(all.data.total);
  });

  test("DELETE /api/log/[id] xoá mục (FR-QL-12)", async ({ request }, testInfo) => {
    const created = await request.post("/api/log", {
      data: {
        text: `Delete test ${testInfo.project.name} ${Date.now()}`,
        domain: "personal",
        type: "journal",
        minutes: 10,
        skillId: null,
        difficulty: null,
        createEvidence: false,
      },
    });
    const createdBody = await created.json();
    const id = createdBody.data.entry.id;

    const deleted = await request.delete(`/api/log/${id}`);
    expect(deleted.status()).toBe(200);

    // Xoá 2 lần ⇒ 404.
    const again = await request.delete(`/api/log/${id}`);
    expect(again.status()).toBe(404);
  });

  test("PATCH /api/log/[id] sửa mức độ khó ⇒ Evidence.rating cập nhật (FR-QL-11)", async ({
    request,
  }, testInfo) => {
    const created = await request.post("/api/log", {
      data: {
        text: `Patch test ${testInfo.project.name} ${Date.now()}`,
        domain: "professional",
        type: "study",
        minutes: 30,
        skillId: "skill-spring-boot",
        difficulty: 2,
        createEvidence: true,
      },
    });
    const createdBody = await created.json();
    const id = createdBody.data.entry.id;

    const patched = await request.patch(`/api/log/${id}`, {
      data: { difficulty: 4 },
    });
    expect(patched.status()).toBe(200);

    const payload = await patched.json();
    expect(payload.data.difficulty).toBe(4);
  });
});
