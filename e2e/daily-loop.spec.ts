import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * E2E — Daily Loop (S01) theo AC-1, AC-DL-2..10.
 *
 * Test chạy trên DB thật (SQLite dev). Mỗi test tự dọn dữ liệu qua API
 * để không phụ thuộc thứ tự chạy.
 */

/**
 * Đồng bộ kế hoạch của ngày về trạng thái "6 slot chưa xong".
 * Dùng API generate fallback — server xoá slot `done: false` rồi tạo lại.
 *
 * ⚠️ Slot `done` là **bất biến** (FR-DL-06): server không xoá được slot đã xong.
 * Vì vậy mỗi test dùng **ngày riêng** (offset khác nhau) để không bị dính
 * dữ liệu của test trước.
 */
async function resetPlan(request: APIRequestContext, date: string) {
  const res = await request.post("/api/plan/generate", {
    data: { date, mode: "fallback" },
  });
  const text = await res.text();
  expect(text).toContain('"type":"done"');
}

/** Ngày cách hôm nay `offset` ngày — mỗi test dùng 1 offset riêng. */
function dateAtOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe.configure({ mode: "serial" });

/**
 * Reset DB trước mỗi test.
 *
 * ⚠️ Slot `done` là bất biến (FR-DL-06) nên API không xoá được slot đã xong.
 * Không reset thì test chạy sau sẽ thấy slot đã xong từ test trước.
 * `globalSetup` chỉ chạy 1 lần cho cả 2 project (mobile + desktop) — mỗi
 * project cần DB sạch riêng.
 */
test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/plan/generate", {
    data: { mode: "fallback" },
  });
  const text = await res.text();

  // Xoá mọi slot đã xong của hôm nay (bất biến ⇒ phải gỡ qua API uncomplete).
  //
  // ⚠️ Next.js compile route lazy: lần gọi API đầu tiên có thể trả HTML
  // (trang lỗi) thay vì JSON ⇒ retry thay vì crash test.
  const plan = await getJsonWithRetry(request, "/api/plan");
  for (const item of plan.data.items) {
    if (item.done) {
      await request.delete("/api/plan/" + plan.data.date + "/complete", {
        data: { slot: item.slot },
      });
    }
  }
  expect(text).toContain('"type":"done"');
});

/**
 * GET API và parse JSON — retry khi server đang compile route (trả HTML).
 *
 * Lần gọi đầu tiên tới một route chưa compile sẽ trả trang lỗi HTML ⇒
 * `res.json()` ném `Unexpected token '<'`. Retry là cách đúng thay vì
 * bắt buộc mọi test phải biết về chi tiết này.
 */
async function getJsonWithRetry(
  request: APIRequestContext,
  url: string,
  attempts = 3,
): Promise<PlanApiResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await request.get(url);
      const text = await res.text();
      return JSON.parse(text) as PlanApiResponse;
    } catch (error) {
      lastError = error;
      // Chờ server compile xong rồi thử lại.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

/** Shape tối thiểu của `GET /api/plan` mà test dùng. */
interface PlanApiResponse {
  ok: boolean;
  data: {
    date: string;
    items: Array<{ slot: number; done: boolean }>;
  };
}

test.describe("S01 — Daily Loop (AC-1)", () => {
  test("trang chủ render, không lỗi console (FR-DL-01)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
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

  test("có 6 hành động nhỏ + chip đếm đã xong (FR-DL-01)", async ({ page, request }) => {
    const dateKey = dateAtOffset(6);
    await resetPlan(request, dateKey);

    await page.goto(`/?date=${dateKey}`);

    const slots = page.locator("article[data-slot]");
    await expect(slots).toHaveCount(6);

    // Chip "x / 6 đã xong"
    await expect(page.getByText(/\d+ \/ 6 đã xong/)).toBeVisible();
  });

  test("bấm 'Hoàn thành' ⇒ tạo bằng chứng + slot gạch ngang (FR-DL-03)", async ({ page, request }) => {
    // Nút "Hoàn thành" chỉ enable cho HÔM NAY (FR-DL-08) → dùng offset 0.
    const dateKey = dateAtOffset(0);
    await resetPlan(request, dateKey);

    await page.goto("/");

    const firstSlot = page.locator("article[data-slot='0']");
    await firstSlot.getByRole("button", { name: /Hoàn thành/ }).click();

    // Đợi refresh ⇒ card chuyển sang trạng thái done
    await expect(
      page.locator("article[data-slot='0']").getByText(/Bằng chứng \+1/),
    ).toBeVisible({ timeout: 10_000 });

    // Chip đếm đã xong tăng lên 1
    await expect(page.getByText(/1 \/ 6 đã xong/)).toBeVisible();
  });

  test("bấm 2 lần không tạo 2 Activity (idempotent) (FR-DL-03)", async ({ page, request }) => {
    // Slot 0 = `study` ⇒ nút "Hoàn thành" (slot 2 là SRS ⇒ nút là link).
    const dateKey = dateAtOffset(0);
    await page.goto("/");
    await page.locator("article[data-slot='0']").getByRole("button", { name: /Hoàn thành/ }).click();
    await expect(
      page.locator("article[data-slot='0']").getByText(/Bằng chứng \+1/),
    ).toBeVisible({ timeout: 10_000 });

    // Gọi API lần 2 ⇒ alreadyDone = true, không tạo Activity mới
    const res = await request.post(`/api/plan/${dateKey}/complete`, {
      data: { slot: 0 },
    });
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.alreadyDone).toBe(true);
    expect(payload.data.activityId).toBeNull();
  });

  test("ngày khác hôm nay ⇒ nút hành động bị disable (FR-DL-08)", async ({ page, request }) => {
    const yKey = dateAtOffset(-1);

    await resetPlan(request, yKey);
    await page.goto(`/?date=${yKey}`);

    await expect(page.getByText(/Chỉ đánh dấu được cho hôm nay/).first()).toBeVisible();
    // Không có nút hành động nào khi xem lại ngày khác.
    await expect(page.getByRole("button", { name: /Hoàn thành/ })).toHaveCount(0);
    await expect(page.getByText(/Chế độ xem lại/)).toBeVisible();
  });

  test("chưa có kế hoạch ⇒ empty state + CTA (FR-DL-07)", async ({ page }) => {
    // Ngày tương lai ⇒ chắc chắn chưa có PlanItem
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const fKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    await page.goto(`/?date=${fKey}`);

    await expect(page.getByText(/Chưa có kế hoạch/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Lập kế hoạch/ })).toBeVisible();
  });
});

test.describe("API — bất biến 6 slot (AC-DL-2)", () => {
  test("GET /api/plan trả đúng 6 slot + đúng tập domain (FR-DL-02)", async ({ request }) => {
    const dateKey = dateAtOffset(3);
    await resetPlan(request, dateKey);

    const res = await request.get(`/api/plan/${dateKey}`);
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.items).toHaveLength(6);

    const domains = payload.data.items.map((i: { domain: string }) => i.domain).sort();
    expect(domains).toEqual([
      "communication",
      "language",
      "language",
      "personal",
      "personal",
      "professional",
    ]);
  });

  test("offline ⇒ 6 slot đúng domain theo vị trí, source = fallback (FR-DL-01)", async ({ request }) => {
    const res = await request.post("http://localhost:3000/api/plan/generate", {
      data: { mode: "fallback" },
    });
    const text = await res.text();

    // SSE: tìm event done
    const doneLine = text.split("\n\n").find((part) => part.includes('"type":"done"'));
    expect(doneLine).toBeDefined();

    const payload = JSON.parse(doneLine!.replace("data: ", ""));
    expect(payload.source).toBe("fallback");
    expect(payload.items).toHaveLength(6);
    expect(payload.items.map((i: { domain: string }) => i.domain)).toEqual([
      "professional",
      "communication",
      "language",
      "language",
      "personal",
      "personal",
    ]);
  });

  test("PATCH items với domain sai ⇒ 400 invalid_domain_mix", async ({ request }) => {
    const res = await request.patch("http://localhost:3000/api/plan/items", {
      data: {
        date: "2026-10-31",
        items: [
          { slot: 0, domain: "professional", action: "A", detail: "D", minutes: 30, skillId: null },
          { slot: 1, domain: "communication", action: "B", detail: "D", minutes: 20, skillId: null },
          { slot: 2, domain: "language", action: "C", detail: "D", minutes: 15, skillId: null },
          { slot: 3, domain: "language", action: "D", detail: "D", minutes: 20, skillId: null },
          { slot: 4, domain: "personal", action: "E", detail: "D", minutes: 8, skillId: null },
          { slot: 5, domain: "professional", action: "F", detail: "D", minutes: 20, skillId: null },
        ],
      },
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain("invalid_domain_mix");
  });

  test("PATCH items thiếu slot ⇒ 400 invalid_slot", async ({ request }) => {
    const res = await request.patch("http://localhost:3000/api/plan/items", {
      data: {
        date: "2026-10-31",
        items: [
          { slot: 0, domain: "professional", action: "A", detail: "D", minutes: 30, skillId: null },
        ],
      },
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
  });

  test("POST complete với slot không tồn tại ⇒ 404", async ({ request }) => {
    // Ngày tương lai ⇒ chắc chắn chưa có PlanItem ⇒ slot không tồn tại.
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const fKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    const res = await request.post(`/api/plan/${fKey}/complete`, {
      data: { slot: 5 },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("S02 — Sinh kế hoạch (AC-DL-9)", () => {
  test("CTA trên S01 dẫn tới /plan?date= (FR-DL-07)", async ({ page }) => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const fKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    await page.goto(`/?date=${fKey}`);
    await page.getByRole("link", { name: /Lập kế hoạch/ }).click();

    await expect(page).toHaveURL(new RegExp(`/plan\\?date=${fKey}`));
  });

  test("S02 render 6 card slot (FR-DL-02)", async ({ page, request }) => {
    const dateKey = dateAtOffset(5);
    await resetPlan(request, dateKey);

    await page.goto(`/plan?date=${dateKey}`);

    await expect(page.locator("article[data-slot]")).toHaveCount(6, { timeout: 15_000 });
  });

  test("S02 có 3 nút hành động chính (FR-DL-06)", async ({ page }) => {
    const dateKey = dateAtOffset(4);

    await page.goto(`/plan?date=${dateKey}`);

    await expect(page.getByRole("button", { name: /Sinh lại toàn bộ/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Khôi phục Offline Fallback/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Duyệt & Áp dụng/ })).toBeVisible();
  });
});

test.describe("AC-DL-3 — sinh lại giữ slot đã xong", () => {
  test("regenerate không ghi đè nội dung slot đã done (FR-DL-06)", async ({ page, request }) => {
    const dateKey = dateAtOffset(0);
    await resetPlan(request, dateKey);

    await page.goto("/");

    // Slot 5 = `health` ⇒ nút "Hoàn thành" (slot 0 dùng cho test idempotent).
    const slot5 = page.locator("article[data-slot='5']");
    const actionBefore = await slot5.locator("h3").innerText();

    // Đánh dấu xong slot 5.
    await slot5.getByRole("button", { name: /Hoàn thành/ }).click();
    await expect(
      page.locator("article[data-slot='5']").getByText(/Bằng chứng \+1/),
    ).toBeVisible({ timeout: 10_000 });

    // Sinh lại kế hoạch — slot 0 đã xong phải giữ nguyên.
    //
    // ⚠️ Nút "Sinh lại toàn bộ (AI)" bị disabled khi offline (không có API
    // key) ⇒ dùng nút "Khôi phục Offline Fallback" — cùng đường ghi vào DB.
    await page.goto(`/plan?date=${dateKey}`);
    await page.getByRole("button", { name: /Khôi phục Offline Fallback/ }).click();

    await expect(page.getByText(/Đã sinh xong kế hoạch/)).toBeVisible({ timeout: 15_000 });

    await page.goto("/");
    const actionAfter = await page
      .locator("article[data-slot='5']")
      .locator("h3")
      .innerText();

    expect(actionAfter).toBe(actionBefore);

    // Và slot 5 vẫn ở trạng thái done.
    await expect(
      page.locator("article[data-slot='5']").getByText(/Bằng chứng \+1/),
    ).toBeVisible();
  });
});

test.describe("AC-DL-7 — duyệt kế hoạch không nhân bản", () => {
  test("duyệt 2 lần ⇒ vẫn đúng 6 row (FR-DL-02)", async ({ request }) => {
    const dateKey = dateAtOffset(2);
    await resetPlan(request, dateKey);

    const items = [
      { slot: 0, domain: "professional", action: "A1", detail: "", minutes: 30, skillId: null },
      { slot: 1, domain: "communication", action: "A2", detail: "", minutes: 20, skillId: null },
      { slot: 2, domain: "language", action: "A3", detail: "", minutes: 15, skillId: null },
      { slot: 3, domain: "language", action: "A4", detail: "", minutes: 15, skillId: null },
      { slot: 4, domain: "personal", action: "A5", detail: "", minutes: 20, skillId: null },
      { slot: 5, domain: "personal", action: "A6", detail: "", minutes: 30, skillId: null },
    ];

    for (let i = 0; i < 2; i++) {
      const res = await request.patch("/api/plan/items", {
        data: { date: dateKey, items, apply: true },
      });
      expect(res.status()).toBe(200);
    }

    const plan = await (await request.get(`/api/plan/${dateKey}`)).json();
    expect(plan.data.items).toHaveLength(6);
  });
});

test.describe("AC-DL-8 — lịch sử theo ngày (read-only)", () => {
  test("xem lại ngày khác ⇒ không có nút đánh dấu (FR-DL-08)", async ({ page, request }) => {
    const yKey = dateAtOffset(-2);
    await resetPlan(request, yKey);

    await page.goto(`/?date=${yKey}`);

    await expect(page.getByText(/Chế độ xem lại/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Hoàn thành/ })).toHaveCount(0);
  });

  test("bộ chọn ngày hiện 7 ngày gần nhất (FR-DL-08)", async ({ page }) => {
    await page.goto("/");

    const picker = page.getByRole("navigation", { name: /Chọn ngày/ });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("link")).toHaveCount(7);
  });
});

test.describe("AC-DL-5 — offline mode", () => {
  test("không có API key vẫn sinh đủ 6 slot (FR-DL-07)", async ({ request }) => {
    const dateKey = dateAtOffset(1);

    const res = await request.post("/api/plan/generate", {
      data: { date: dateKey, mode: "fallback" },
    });
    const text = await res.text();

    const doneLine = text.split("\n\n").find((part) => part.includes('"type":"done"'));
    expect(doneLine).toBeDefined();

    const payload = JSON.parse(doneLine!.replace("data: ", ""));
    expect(payload.items).toHaveLength(6);
    expect(payload.source).toBe("fallback");
  });

  test("offline vẫn ghi được vào DB (bấm 'Xong' hoạt động) (FR-DL-03)", async ({ page, request }) => {
    const dateKey = dateAtOffset(0);
    await resetPlan(request, dateKey);

    await page.goto("/");
    // Slot 0 = `study` ⇒ nút "Hoàn thành" (slot 3 = `language` ⇒ nút là link).
    await page
      .locator("article[data-slot='0']")
      .getByRole("button", { name: /Hoàn thành/ })
      .click();

    await expect(
      page.locator("article[data-slot='0']").getByText(/Bằng chứng \+1/),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("R-DL-5 — đường bỏ đánh dấu", () => {
  test("bấm 'Bỏ đánh dấu' ⇒ slot trở lại chưa xong", async ({ page, request }) => {
    // ⚠️ Slot `done` là bất biến (FR-DL-06) ⇒ mỗi test đánh dấu phải dùng
    // ngày riêng, nếu không test sau sẽ thấy slot đã xong từ test trước.
    // Ngày +4 chưa từng được đánh dấu trong suite.
    const dateKey = dateAtOffset(4);
    await resetPlan(request, dateKey);

    await page.goto(`/?date=${dateKey}`);

    // Đánh dấu xong slot 5 qua API (ngày +4 không bấm được từ UI).
    const marked = await request.post(`/api/plan/${dateKey}/complete`, {
      data: { slot: 5 },
    });
    expect(marked.ok()).toBe(true);

    await page.reload();
    await expect(
      page.locator("article[data-slot='5']").getByText(/Bằng chứng \+1/),
    ).toBeVisible({ timeout: 10_000 });

    // Bấm "Bỏ đánh dấu" ⇒ slot trở lại chưa xong.
    await page.locator("article[data-slot='5']").getByRole("button", { name: /Bỏ đánh dấu/ }).click();

    await expect(
      page.locator("article[data-slot='5']").getByText(/Bằng chứng \+1/),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});

test.describe("19.3 — nút hành động theo loại slot", () => {
  test("slot SRS có nút 'Bắt đầu ôn', slot nhật ký có 'Viết nhật ký'", async ({
    page,
    request,
  }) => {
    const dateKey = dateAtOffset(0);
    await resetPlan(request, dateKey);

    await page.goto("/");

    // Slot 2 = srs, slot 4 = journal.
    await expect(
      page.locator("article[data-slot='2']").getByRole("link", { name: /Bắt đầu ôn/ }),
    ).toBeVisible();
    await expect(
      page.locator("article[data-slot='4']").getByRole("link", { name: /Viết nhật ký/ }),
    ).toBeVisible();
  });
});

test.describe("AC-DL-4 — năng lượng tuần & streak (E2E)", () => {
  test("năng lượng tuần hiện đúng tỷ lệ slot đã xong", async ({ page, request }) => {
    // Dựng 6 slot hôm nay: 3 slot done ⇒ 50%.
    const today = dateAtOffset(0);
    await resetPlan(request, today);

    const plan = await (await request.get(`/api/plan/${today}`)).json();
    const items = plan.data.items.map((item: { slot: number; domain: string }) => ({
      slot: item.slot,
      domain: item.domain,
      action: `Slot ${item.slot}`,
      detail: "",
      minutes: 20,
      skillId: null,
    }));

    await request.patch("/api/plan/items", {
      data: { date: today, items, apply: true },
    });

    // Đánh dấu 3 slot đầu.
    for (const slot of [0, 1, 2]) {
      await request.post(`/api/plan/${today}/complete`, { data: { slot } });
    }

    await page.goto("/");

    // ⚠️ Không hardcode 50% — các test khác có thể để lại kế hoạch ở ngày
    // hôm qua/kia, làm tỷ lệ tuần khác 50%. Test này verify **UI khớp API**;
    // con số 79% (33/42) đã được cover ở integration test (`daily-loop.db.test.ts`).
    const api = await (await request.get("/api/plan")).json();
    const expectedPct = `${api.data.weeklyEnergy.pct}%`;

    await expect(page.getByText(/năng lượng tuần/).first()).toBeVisible();
    await expect(page.getByText(expectedPct).first()).toBeVisible();
  });
});
