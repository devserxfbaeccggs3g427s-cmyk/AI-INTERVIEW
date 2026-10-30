/**
 * E2E — `/api/settings/key` + bảo mật P6 STRICT (task 9.6 · AC-16).
 *
 * ⚠️ Test này **ghi thật** vào file `.env.local` ở thư mục gốc project (đó là
 * hành vi đúng theo yêu cầu: key phải nằm local, không nằm trong DB, không nằm
 * trong `public/`). Vì vậy:
 *   - `beforeAll` → backup nội dung `.env.local` (nếu có).
 *   - `afterAll`  → khôi phục nguyên trạng (xoá file nếu trước đó không có).
 *
 * Key dùng trong test là **chuỗi giả** (`sk-ant-test-fixture-000`) — KHÔNG bao
 * giờ dùng key thật trong repo (AC-16 + quy tắc "không hardcode `sk-ant-...`").
 */

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Key giả — rõ ràng là fixture, không phải key thật của ai. */
const FAKE_KEY = "sk-ant-test-fixture-000";

/** Chuỗi che mà server được phép trả về (AC-16). */
const MASKED = "sk-ant-••••••••";

/**
 * Tìm thư mục gốc project (chứa `package.json` + `playwright.config.ts`).
 *
 * Bắt đầu từ `process.cwd()` rồi đi lên — an toàn cho cả khi Playwright được
 * chạy từ thư mục con.
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "playwright.config.ts"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const ENV_LOCAL = path.join(ROOT, ".env.local");
const GITIGNORE = path.join(ROOT, ".gitignore");

/** Nội dung `.env.local` trước khi test chạy (để khôi phục). */
let envLocalBackup: string | null = null;
/** `.env.local` có tồn tại trước khi test chạy hay không. */
let envLocalExisted = false;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  envLocalExisted = fs.existsSync(ENV_LOCAL);
  envLocalBackup = envLocalExisted ? fs.readFileSync(ENV_LOCAL, "utf8") : null;
});

test.afterAll(() => {
  // Khôi phục nguyên trạng `.env.local` — test không được để lại rác.
  if (envLocalExisted && envLocalBackup !== null) {
    fs.writeFileSync(ENV_LOCAL, envLocalBackup, "utf8");
  } else if (!envLocalExisted && fs.existsSync(ENV_LOCAL)) {
    fs.unlinkSync(ENV_LOCAL);
  }
});

test.describe("GET /api/settings/key — chỉ trả key đã che", () => {
  test("trả configured + masked, tuyệt đối không có key đầy đủ", async ({ request }) => {
    const response = await request.get("/api/settings/key");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as {
      ok: boolean;
      data: { configured: boolean; masked: string | null };
    };

    expect(body.ok).toBe(true);
    expect(typeof body.data.configured).toBe("boolean");

    if (body.data.configured) {
      expect(body.data.masked).toBe(MASKED);
    } else {
      expect(body.data.masked).toBeNull();
    }

    // Response không được chứa bất kỳ giá trị key nào.
    const raw = await response.text();
    expect(raw).not.toContain(FAKE_KEY);
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9_-]{20,}/);
  });
});

test.describe("POST /api/settings/key — lưu key vào .env.local", () => {
  test("ghi key vào .env.local trên máy và không trả key đầy đủ về client", async ({
    request,
  }) => {
    const response = await request.post("/api/settings/key", {
      data: { apiKey: FAKE_KEY },
    });
    expect(response.ok()).toBeTruthy();

    const rawBody = await response.text();
    const body = JSON.parse(rawBody) as { ok: boolean; data: { masked: string } };

    expect(body.ok).toBe(true);
    expect(body.data.masked).toBe(MASKED);

    // ── AC-16: response KHÔNG được chứa key đầy đủ ─────────────────────
    expect(rawBody).not.toContain(FAKE_KEY);

    // ── Key phải nằm thật trong `.env.local` ở thư mục gốc project ─────
    expect(fs.existsSync(ENV_LOCAL)).toBe(true);
    const fileContent = fs.readFileSync(ENV_LOCAL, "utf8");
    expect(fileContent).toContain(`ANTHROPIC_API_KEY=${FAKE_KEY}`);

    // ── `.env.local` KHÔNG nằm trong `public/` (không thể bị phục vụ HTTP) ─
    expect(ENV_LOCAL.startsWith(path.join(ROOT, "public") + path.sep)).toBe(false);
  });

  test("GET sau khi lưu → configured = true, vẫn chỉ trả masked", async ({ request }) => {
    const response = await request.get("/api/settings/key");
    const body = (await response.json()) as {
      ok: boolean;
      data: { configured: boolean; masked: string | null };
    };

    expect(body.ok).toBe(true);
    expect(body.data.configured).toBe(true);
    expect(body.data.masked).toBe(MASKED);

    const raw = await response.text();
    expect(raw).not.toContain(FAKE_KEY);
  });

  test("key không hợp lệ bị từ chối và KHÔNG ghi vào .env.local", async ({ request }) => {
    const before = fs.readFileSync(ENV_LOCAL, "utf8");

    const response = await request.post("/api/settings/key", {
      data: { apiKey: "not-a-real-anthropic-key" },
    });
    expect(response.ok()).toBeFalsy();

    const body = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("validation");

    // File `.env.local` phải giữ nguyên — không bị ghi đè bằng giá trị rác.
    expect(fs.readFileSync(ENV_LOCAL, "utf8")).toBe(before);
  });
});

test.describe("P6 STRICT — .gitignore chặn .env.local", () => {
  test(".gitignore chứa .env.local", () => {
    expect(fs.existsSync(GITIGNORE)).toBe(true);
    const content = fs.readFileSync(GITIGNORE, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(lines).toContain(".env.local");
  });

  test("git check-ignore xác nhận .env.local bị bỏ qua", () => {
    // `git check-ignore` exit code 0 = file bị ignore.
    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("git", ["check-ignore", "-v", ".env.local"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // Non-zero exit → KHÔNG bị ignore → test fail với thông báo rõ ràng.
      exitCode = 1;
      output = error instanceof Error ? error.message : String(error);
    }

    expect(exitCode, `git check-ignore thất bại: ${output}`).toBe(0);
    expect(output).toContain(".env.local");
  });
});
