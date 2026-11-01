import { expect, test } from "@playwright/test";

/**
 * E2E — Luyện nói / Luyện viết / Hội thoại (S10 + S11).
 *
 * ⚠️ AC-CM-1 — rubric 5 tiêu chí.
 * ⚠️ AC-CM-2 — tổng điểm = trung bình.
 * ⚠️ AC-CM-11 — không có key ⇒ nói rõ, KHÔNG giả lập AI.
 */

test.describe("S10 — Luyện viết (AC-CM-1, AC-CM-2, AC-CM-11)", () => {
  test("mở trang luyện, có kho đề + 5 tiêu chí khi chấm", async ({ page }) => {
    await page.goto("/practice/speak");

    await expect(page.getByRole("heading", { name: /Luyện nói/ })).toBeVisible();
    await expect(page.getByLabel("Đề bài")).toBeVisible();
    await expect(page.getByLabel("Bài của bạn")).toBeVisible();
  });

  test("chấm điểm cục bộ khi không có key ⇒ hiện 5 tiêu chí + nhãn nguồn (AC-CM-1, AC-CM-11)", async ({
    page,
  }) => {
    await page.goto("/practice/speak");

    // ⚠️ Không có API key ⇒ nói rõ ngay từ đầu.
    await expect(page.getByText(/chấm bằng rule cục bộ, không phải AI/)).toBeVisible();

    await page.getByLabel("Bài của bạn").fill(
      "This is my practice text for the speaking module. It has several sentences.",
    );
    await page.getByRole("button", { name: "Chấm điểm" }).click();

    await expect(page.getByRole("heading", { name: "Điểm" })).toBeVisible({
      timeout: 10_000,
    });

    // 5 tiêu chí.
    for (const label of [
      "Độ chính xác",
      "Độ trôi chảy",
      "Từ vựng",
      "Ngữ pháp",
      "Mạch lạc",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // ⚠️ Nguồn phải ghi rõ là rule cục bộ, KHÔNG ghi "AI".
    // `.first()` — nhãn này xuất hiện ở cả chip nguồn + dải hướng dẫn.
    await expect(page.getByText("Rule cục bộ").first()).toBeVisible();
  });

  test("API /api/grade trả rubric đủ 5 tiêu chí + tổng = trung bình (AC-CM-1, AC-CM-2)", async ({
    request,
  }) => {
    const res = await request.post("/api/grade", {
      data: {
        text: "This is a test answer with a few words in it.",
        lang: "en",
        mode: "write",
        allowLocalFallback: true,
      },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();

    const rubric = payload.data.rubric as Record<string, number>;
    expect(Object.keys(rubric)).toHaveLength(5);

    // Tổng = trung bình 5 tiêu chí.
    const values = Object.values(rubric);
    const expected = Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
    );
    expect(payload.data.score).toBe(expected);

    // Nguồn cục bộ khi không có key.
    expect(payload.data.source).toBe("local");
  });

  test("API /api/grade không có key + không cho fallback ⇒ lỗi, KHÔNG giả lập (AC-CM-11)", async ({
    request,
  }) => {
    const res = await request.post("/api/grade", {
      data: {
        text: "Some text",
        allowLocalFallback: false,
      },
    });

    expect(res.status()).toBe(503);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("no_api_key");
  });

  test("API /api/grade body rỗng ⇒ 400", async ({ request }) => {
    const res = await request.post("/api/grade", { data: { text: "" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("S10 — Lưu lượt luyện (AC-CM-3, AC-CM-5)", () => {
  test("commit lượt luyện ⇒ tạo Activity + trả delta (AC-CM-3, AC-CM-5)", async ({
    request,
  }) => {
    const text = `practice commit ${Date.now()}`;

    const res = await request.post("/api/speak/commit", {
      data: {
        promptId: null,
        text,
        lang: "en",
        mode: "write",
        score: 3.5,
        rubric: {
          accuracy: 3.5,
          fluency: 3.5,
          vocabulary: 3.5,
          grammar: 3.5,
          coherence: 3.5,
        },
      },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.attempt.id).toBeTruthy();

    // Lượt đã lưu ⇒ xuất hiện trong lịch sử.
    const history = await request.get("/api/speak/history?limit=10");
    const historyPayload = await history.json();
    const found = (historyPayload.data.items as Array<{ text: string }>).some(
      (item) => item.text === text,
    );
    expect(found).toBe(true);
  });

  test("commit nội dung rỗng ⇒ 400", async ({ request }) => {
    const res = await request.post("/api/speak/commit", {
      data: { text: "   " },
    });

    expect(res.status()).toBe(400);
  });
});

test.describe("S11 — Hội thoại role-play (AC-CM-6, AC-CM-7, AC-CM-8)", () => {
  test("mở tab hội thoại, có tình huống + nút chấm mục tiêu", async ({ page }) => {
    await page.goto("/practice/language");

    await page.getByRole("button", { name: "Hội thoại" }).click();

    await expect(page.getByLabel("Tình huống")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chấm mục tiêu" })).toBeVisible();
  });

  test("không có key ⇒ nói rõ hội thoại cần API key, KHÔNG giả lập (AC-CM-11)", async ({
    page,
  }) => {
    await page.goto("/practice/language");

    await page.getByRole("button", { name: "Hội thoại" }).click();

    await expect(page.getByText(/hội thoại AI cần API key/)).toBeVisible();
    // Nút gửi bị disable khi không có key.
    await expect(page.getByRole("button", { name: "Gửi" })).toBeDisabled();
  });

  test("API /api/roleplay không có key ⇒ 503, KHÔNG giả lập hội thoại (AC-CM-11)", async ({
    request,
  }) => {
    const prompts = await request.get("/api/speak/prompts");
    const promptsPayload = await prompts.json();
    const scenarioId = promptsPayload.data.scenarios[0]?.id;

    expect(scenarioId).toBeTruthy();

    const res = await request.post("/api/roleplay", {
      data: { scenarioId, action: "turn", history: [] },
    });

    expect(res.status()).toBe(503);
    const payload = await res.json();
    expect(payload.error).toBe("no_api_key");
  });

  test("API /api/roleplay scenario không tồn tại ⇒ 404", async ({ request }) => {
    const res = await request.post("/api/roleplay", {
      data: { scenarioId: "khong-ton-tai", action: "turn", history: [] },
    });

    expect(res.status()).toBe(404);
  });

  test("API /api/speak/prompts trả kho bài mẫu (AC-CM-6)", async ({ request }) => {
    const res = await request.get("/api/speak/prompts");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.prompts.length).toBeGreaterThan(0);
    expect(payload.data.scenarios.length).toBeGreaterThan(0);

    // Mỗi bài có đề + mã.
    const first = payload.data.prompts[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
  });
});


test.describe("S07/S08 — Luyện giao tiếp viết & nói", () => {
  test("S07 /speak/write render đề + ô viết (AC-CM-01)", async ({ page }) => {
    await page.goto("/speak/write");

    await expect(page.getByRole("heading", { name: /Luyện nói/ })).toBeVisible();
    await expect(page.getByLabel("Đề bài")).toBeVisible();
    await expect(page.getByLabel("Bài của bạn")).toBeVisible();
  });

  test("S08 /speak/talk có nút ghi âm + ô transcript (AC-CM-04)", async ({ page }) => {
    await page.goto("/speak/talk");

    await expect(page.getByRole("heading", { name: "Luyện nói" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bắt đầu ghi/ })).toBeVisible();
    await expect(page.getByLabel(/Lời nói/)).toBeVisible();
  });

  test("rubric giao tiếp có đúng 5 tiêu chí đúng thứ tự (AC-CM-01)", async ({
    request,
  }) => {
    const res = await request.get("/api/grade");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    // ⚠️ Spec §1: Rõ ràng · Cấu trúc · Giọng văn · Tự nhiên · Ngữ pháp.
    expect(payload.data.criteria).toEqual([
      "clarity",
      "structure",
      "tone",
      "naturalness",
      "grammar",
    ]);
  });

  test("S07 chấm điểm hiện 5 tiêu chí đúng tên (AC-CM-1)", async ({ page }) => {
    await page.goto("/speak/write");

    await page.getByLabel("Bài của bạn").fill(
      "Dear Mr Minh, I am writing to request two days of leave. I have synced with Nam.",
    );
    await page.getByRole("button", { name: "Chấm điểm" }).click();

    await expect(page.getByRole("heading", { name: "Điểm" })).toBeVisible({
      timeout: 10_000,
    });

    for (const label of ["Rõ ràng", "Cấu trúc", "Giọng văn", "Tự nhiên", "Ngữ pháp"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });
});

test.describe("S18 — Báo cáo kết quả phỏng vấn (FR-MI-09)", () => {
  test("mở trang báo cáo, thấy tiêu đề + trạng thái chưa có báo cáo", async ({
    page,
  }) => {
    await page.goto("/interview/report");

    await expect(
      page.getByRole("heading", { name: "Kết quả phỏng vấn" }),
    ).toBeVisible();
    await expect(page.getByText(/Chưa có báo cáo/)).toBeVisible();
  });

  test("API report với session không tồn tại ⇒ 404", async ({ request }) => {
    const res = await request.post("/api/interview/report", {
      data: { sessionId: "khong-ton-tai" },
    });

    expect(res.status()).toBe(404);
  });

  test("API report thiếu sessionId ⇒ 400", async ({ request }) => {
    const res = await request.post("/api/interview/report", { data: {} });
    expect(res.status()).toBe(400);
  });
});
