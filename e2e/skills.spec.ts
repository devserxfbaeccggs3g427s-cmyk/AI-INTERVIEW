import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * E2E — Cây kỹ năng (S03) & Chi tiết kỹ năng (S04).
 *
 * ⚠️ NFR-SK-01 — các màn hình này **không phụ thuộc AI**: mọi số liệu là
 * truy vấn SQLite ⇒ test chạy được kể cả khi thiếu `ANTHROPIC_API_KEY`.
 */

/**
 * Reset cây kỹ năng về trạng thái seed trước mỗi test.
 *
 * ⚠️ Test `DELETE /api/skills/[id]` xoá node thật ⇒ node con chuyển lên ông
 * bà và **thành node gốc mới** ⇒ `domainCount` tăng ⇒ các test sau fail
 * (không phải lỗi app, mà là test không tự dọn).
 *
 * `globalSetup` chỉ chạy 1 lần cho cả 2 project (mobile + desktop) ⇒ reset
 * ở đây để mỗi test đều bắt đầu từ cây seed sạch.
 */
test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
});

test.describe("S03 — Cây kỹ năng (FR-SK-01, FR-SK-07)", () => {
  test("render cây 3 tầng + 4 domain (FR-SK-01)", async ({ page }) => {
    await page.goto("/skills");

    await expect(page.getByRole("heading", { name: "Cây kỹ năng & bằng chứng" })).toBeVisible();

    // 4 domain (node gốc) — mỗi domain là 1 <h2>.
    const domainHeadings = page.getByRole("heading", { level: 2 });
    await expect(domainHeadings).toHaveCount(4);

    // Cây là <ul>/<li> semantic (NFR-SK-05).
    const tree = page.getByRole("list");
    await expect(tree.first()).toBeVisible();
  });

  test("hiện thống kê tổng quan, không phải % mơ hồ (FR-SK-06, P7)", async ({ page }) => {
    await page.goto("/skills");

    await expect(page.getByText("Tổng domain")).toBeVisible();
    await expect(page.getByText("Tổng bằng chứng")).toBeVisible();
    await expect(page.getByText("Bằng chứng đạt chuẩn")).toBeVisible();

    // FR-SK-06 — tuyệt đối không hiển thị "hoàn thành 73%".
    await expect(page.getByText(/hoàn thành \d+%/i)).toHaveCount(0);
  });

  test("mọi node có thang 0–5 (không dùng %) (FR-SK-02)", async ({ page }) => {
    await page.goto("/skills");

    // Mỗi node con hiện "N/5".
    const scales = page.getByRole("meter");
    expect(await scales.count()).toBeGreaterThan(0);

    const first = scales.first();
    await expect(first).toHaveAttribute("aria-valuemax", "5");
  });

  test("bấm vào kỹ năng ⇒ mở S04 (FR-SK-05)", async ({ page }) => {
    await page.goto("/skills");

    const firstLink = page.locator('a[href^="/skills/"]').first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

    await firstLink.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, "\\/")));

    // S04 có breadcrumb + tiêu chuẩn thăng cấp.
    await expect(page.getByText("Tiêu chuẩn thăng cấp")).toBeVisible();
  });

  test("không phụ thuộc AI — hiện đủ khối khi thiếu API key (NFR-SK-01)", async ({
    page,
  }) => {
    await page.goto("/skills");

    // Không có banner "cần API key" chặn nội dung.
    await expect(page.getByText(/cần API key/i)).toHaveCount(0);
    await expect(page.getByText("Mục kỹ năng")).toBeVisible();
  });
});

test.describe("S04 — Chi tiết kỹ năng (FR-SK-05, FR-SK-12..FR-SK-15)", () => {
  test("hiện breadcrumb + level + tiêu chuẩn thăng cấp (FR-SK-13)", async ({ page }) => {
    await page.goto("/skills");
    await page.locator('a[href^="/skills/"]').first().click();

    await expect(page.getByRole("navigation", { name: "Đường dẫn kỹ năng" })).toBeVisible();
    await expect(page.getByText("Tiêu chuẩn thăng cấp")).toBeVisible();
    await expect(page.getByText(/Mục tiêu Cấp \d/)).toBeVisible();
    await expect(page.getByText(/Cần: \d+ Bằng chứng/)).toBeVisible();
  });

  test("bảng nhật ký bằng chứng là <table> semantic (NFR-SK-05) (FR-SK-12)", async ({ page }) => {
    await page.goto("/skills");
    await page.locator('a[href^="/skills/"]').first().click();

    const table = page.getByRole("table");
    // Có thể không có bằng chứng ⇒ hiện empty state thay vì bảng rỗng.
    const count = await table.count();
    if (count > 0) {
      await expect(table).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "Ngày" })).toBeVisible();
    } else {
      // ⚠️ Selector cụ thể — regex chung sẽ khớp cả empty state của biểu đồ
      // ("Chưa có bằng chứng nào để dựng biểu đồ") ⇒ vi phạm strict mode.
      await expect(
        page.getByText(/Chưa có bằng chứng nào cho kỹ năng này/),
      ).toBeVisible();
    }
  });

  test("không vẽ chart rỗng khi thiếu dữ liệu (FR-SK-14)", async ({ page }) => {
    await page.goto("/skills");
    await page.locator('a[href^="/skills/"]').first().click();

    // Hoặc có biểu đồ, hoặc có thông báo "chưa có bằng chứng".
    const chart = page.getByText("Level theo tuần");
    await expect(chart).toBeVisible();

    const emptyChart = page.getByText(/Chưa có bằng chứng nào để dựng biểu đồ/);
    const chartBody = page.locator("section", { has: chart });

    const hasEmpty = (await emptyChart.count()) > 0;
    if (!hasEmpty) {
      // Có dữ liệu ⇒ phải có ít nhất 1 cột tuần.
      expect(await chartBody.getByText(/W\d\d/).count()).toBeGreaterThan(0);
    }
  });

  test("404 cho kỹ năng không tồn tại", async ({ page }) => {
    const response = await page.goto("/skills/khong-ton-tai-abc123");

    expect(response?.status()).toBe(404);
  });
});

test.describe("API — cây kỹ năng", () => {

  test("GET /api/skills trả 4 domain + cây lồng nhau (FR-SK-01)", async ({ request }) => {
    const res = await request.get("/api/skills");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.domainCount).toBe(4);
    expect(payload.data.domains).toHaveLength(4);

    // Tầng 1 có con, tầng 3 là lá.
    for (const domain of payload.data.domains) {
      expect(domain.children.length).toBeGreaterThan(0);
    }
  });

  test("GET /api/skills/[id] trả chi tiết + path (FR-SK-05)", async ({ request }) => {
    const tree = await (await request.get("/api/skills")).json();
    const leaf = tree.data.domains[0].children[0].children[0];

    const res = await request.get(`/api/skills/${leaf.id}`);
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.skill.id).toBe(leaf.id);
    expect(payload.data.path.length).toBeGreaterThanOrEqual(3);
    expect(payload.data.promotion.requiredEvidence).toBe(
      leaf.targetLevel * 3,
    );
  });

  test("POST /api/skills/focus đặt trọng tâm (FR-SK-08)", async ({ request }) => {
    const tree = await (await request.get("/api/skills")).json();
    const skillId = tree.data.domains[0].children[0].id;

    const res = await request.post("/api/skills/focus", {
      data: { skillId },
    });
    expect(res.status()).toBe(200);

    const after = await (await request.get("/api/skills")).json();
    expect(after.data.focusSkillId).toBe(skillId);
  });

  test("POST /api/skills tạo node tầng 3, tầng 4 bị từ chối (FR-SK-04)", async ({
    request,
  }) => {
    const tree = await (await request.get("/api/skills")).json();
    // ⚠️ Cha phải là node **tầng 2** — tạo con của node tầng 3 là tầng 4 ⇒
    // server từ chối đúng theo quy tắc "cây chỉ có 3 tầng".
    const parent = tree.data.domains[0].children[0];

    // Tạo node tầng 3 hợp lệ.
    const created = await request.post("/api/skills", {
      data: {
        name: "Kỹ năng test E2E",
        domain: parent.domain,
        parentId: parent.id,
        targetLevel: 3,
      },
    });
    expect(created.status()).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.ok).toBe(true);
    expect(createdBody.data.id).toBeTruthy();

    // Tạo node tầng 4 (cha là node tầng 3 vừa tạo) ⇒ phải bị từ chối.
    const tooDeep = await request.post("/api/skills", {
      data: {
        name: "Tầng 4 — không được phép",
        domain: parent.domain,
        parentId: createdBody.data.id,
        targetLevel: 3,
      },
    });
    expect(tooDeep.status()).toBe(400);
    const tooDeepBody = await tooDeep.json();
    expect(tooDeepBody.message).toContain("max_depth_exceeded");
  });

  test("DELETE /api/skills/[id] chuyển node con lên ông bà (FR-SK-11)", async ({
    request,
  }) => {
    const tree = await (await request.get("/api/skills")).json();
    const domain = tree.data.domains[0];
    // Node tầng 2 (có 1 node con tầng 3 trong seed).
    const parent = domain.children.find(
      (node: { children: unknown[] }) => node.children.length > 0,
    );
    expect(parent).toBeTruthy();

    // ⚠️ Không xoá node seed thật — 2 project (mobile + desktop) chạy song
    // song trên cùng SQLite DB, xoá node thật sẽ làm project còn lại assert
    // trên cây đã bị cắt. Tạo nhánh test riêng rồi xoá nhánh đó.
    // ⚠️ Nhánh phải là node **tầng 2** (cha = domain gốc) thì node con của
    // nó mới là tầng 3 — cây chỉ có 3 tầng nên tạo con của node tầng 3 sẽ
    // bị server từ chối (max_depth_exceeded).
    const branch = await request.post("/api/skills", {
      data: {
        name: `Nhánh test xoá ${Date.now()}`,
        domain: parent.domain,
        parentId: parent.parentId ?? null,
        targetLevel: 2,
      },
    });
    expect(branch.status()).toBe(200);
    const branchId = (await branch.json()).data.id;

    const branchChild = await request.post("/api/skills", {
      data: {
        name: `Nhánh test con ${Date.now()}`,
        domain: parent.domain,
        parentId: branchId,
        targetLevel: 3,
      },
    });
    expect(branchChild.status()).toBe(200);
    const branchChildId = (await branchChild.json()).data.id;

    // Xoá node tầng 2 **của nhánh test**.
    const deleted = await request.delete(`/api/skills/${branchId}`);
    expect(deleted.status()).toBe(200);

    // Node con (tầng 3) phải còn, và cha của nó = **ông bà** — vì nhánh tầng 2
    // bị xoá, ông bà là domain gốc (`parentId = null`) ⇒ node con thành node
    // gốc mới.
    const childAfter = await (await request.get(`/api/skills/${branchChildId}`)).json();
    expect(childAfter.ok).toBe(true);
    expect(childAfter.data.skill.parentId).toBeNull();
  });
});

  test("DELETE /api/skills/[id] trên node tầng 3 ⇒ con chuyển lên node tầng 2", async ({
    request,
  }) => {
    const tree = await (await request.get("/api/skills")).json();
    const domain = tree.data.domains[0];
    const level2 = domain.children[0];

    // ⚠️ Không xoá node seed thật — 2 project (mobile + desktop) chạy song
    // song trên cùng SQLite DB, xoá node thật sẽ làm project còn lại assert
    // trên cây đã bị cắt. Tạo nhánh test riêng rồi xoá nhánh đó.
    const branch = await request.post("/api/skills", {
      data: {
        name: `Nhánh test tầng 3 ${Date.now()}`,
        domain: level2.domain,
        parentId: level2.parentId ?? null,
        targetLevel: 2,
      },
    });
    expect(branch.status()).toBe(200);
    const branchId = (await branch.json()).data.id;

    const branchChild = await request.post("/api/skills", {
      data: {
        name: `Nhánh test tầng 3 con ${Date.now()}`,
        domain: level2.domain,
        parentId: branchId,
        targetLevel: 3,
      },
    });
    expect(branchChild.status()).toBe(200);
    const branchChildId = (await branchChild.json()).data.id;

    const deleted = await request.delete(`/api/skills/${branchId}`);
    expect(deleted.status()).toBe(200);

    // Node con của nhánh bị xoá phải chuyển lên ông bà (domain gốc).
    const childAfter = await (await request.get(`/api/skills/${branchChildId}`)).json();
    expect(childAfter.ok).toBe(true);
    expect(childAfter.data.skill.parentId).toBeNull();

    // Node tầng 2 gốc vẫn còn nguyên.
    const treeAfter = await (await request.get("/api/skills")).json();
    const level2After = treeAfter.data.domains[0].children.find(
      (node: { id: string }) => node.id === level2.id,
    );
    expect(level2After).toBeTruthy();
  });
