import { expect, test } from "@playwright/test";

/**
 * E2E — AI Interview Studio (S11).
 *
 * ⚠️ FR-MI-05 — điểm chi tiết theo rubric.
 * ⚠️ FR-MI-11 — không có key ⇒ nói rõ, KHÔNG giả lập interviewer.
 */

test.describe("S11 — Thiết lập phỏng vấn (FR-MI-01, FR-MI-08)", () => {
  test("mở trang thiết lập, thấy studio + nút bắt đầu", async ({ page }) => {
    await page.goto("/interview/setup");

    await expect(
      page.getByRole("heading", { name: "AI Interview Studio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Bắt đầu phỏng vấn/ }),
    ).toBeVisible();
  });

  test("không có key ⇒ nói rõ cần API key, nút bắt đầu bị disable (FR-MI-11)", async ({
    page,
  }) => {
    await page.goto("/interview/setup");

    await expect(page.getByText(/phỏng vấn AI cần API key/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Bắt đầu phỏng vấn/ }),
    ).toBeDisabled();
  });

  test("API tạo hồ sơ phỏng vấn (FR-MI-01)", async ({ request }) => {
    const label = `E2E profile ${Date.now()}`;

    const res = await request.post("/api/interview/profiles", {
      data: {
        label,
        jobTitle: "Backend Engineer",
        seniority: "mid",
        language: "en",
        questionKinds: ["concept", "design"],
        focusSkills: [],
      },
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.label).toBe(label);
    expect(payload.data.id).toBeTruthy();

    // Đọc lại được.
    const read = await request.get(`/api/interview/profiles/${payload.data.id}`);
    const readPayload = await read.json();
    expect(readPayload.data.label).toBe(label);

    // Danh sách chứa hồ sơ vừa tạo.
    const list = await request.get("/api/interview/profiles");
    const listPayload = await list.json();
    expect(
      (listPayload.data.profiles as Array<{ label: string }>).some(
        (profile) => profile.label === label,
      ),
    ).toBe(true);

    // Dọn.
    await request.delete(`/api/interview/profiles/${payload.data.id}`);
  });

  test("API tạo hồ sơ thiếu trường bắt buộc ⇒ 400", async ({ request }) => {
    const res = await request.post("/api/interview/profiles", {
      data: { label: "" },
    });

    expect(res.status()).toBe(400);
  });

  test("API start không có key ⇒ 503, KHÔNG giả lập interviewer (FR-MI-11)", async ({
    request,
  }) => {
    const profiles = await request.get("/api/interview/profiles");
    const profilesPayload = await profiles.json();
    const profileId = profilesPayload.data.profiles[0]?.id;

    // Nếu chưa có hồ sơ thì tạo một cái.
    let id = profileId;
    if (!id) {
      const created = await request.post("/api/interview/profiles", {
        data: {
          label: `E2E start ${Date.now()}`,
          jobTitle: "Backend Engineer",
          seniority: "mid",
          language: "en",
          questionKinds: ["concept"],
        },
      });
      id = (await created.json()).data.id;
    }

    const res = await request.post("/api/interview/start", {
      data: { profileId: id, plannedCount: 4 },
    });

    expect(res.status()).toBe(503);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("no_api_key");
  });

  test("API start với profile không tồn tại ⇒ 404", async ({ request }) => {
    const res = await request.post("/api/interview/start", {
      data: { profileId: "khong-ton-tai", plannedCount: 4 },
    });

    expect(res.status()).toBe(404);
  });

  test("API danh sách phiên trả mảng + lịch sử (FR-MI-10)", async ({ request }) => {
    const res = await request.get("/api/interview/sessions?limit=10");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.sessions)).toBe(true);
  });

  test("API weak-skills trả gợi ý kỹ năng yếu (FR-MI-08)", async ({ request }) => {
    const res = await request.get("/api/interview/weak-skills?count=2");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.weakSkills)).toBe(true);
  });

  test("API weak-skills count sai ⇒ 400", async ({ request }) => {
    const res = await request.get("/api/interview/weak-skills?count=99");
    expect(res.status()).toBe(400);
  });
});
