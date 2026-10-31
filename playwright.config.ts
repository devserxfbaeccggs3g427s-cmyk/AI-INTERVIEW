import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E — 2 viewport theo design-system §4:
 *   - mobile  390×844  (1 cột, <768px)
 *   - desktop 1280×900 (12 cột, ≥1280px)
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // 2 project (mobile + desktop) dùng CHUNG SQLite local ⇒ phải chạy tuần tự,
  // nếu không 2 project sẽ race trên slot đã xong (bất biến theo FR-DL-06).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 1 worker: các test dùng chung SQLite local — chạy song song sẽ race trên slot đã xong.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Cả 2 project dùng chromium — chỉ cần cài 1 browser (nhanh hơn CI).
      // Viewport mobile vẫn giữ đúng 390×844 của design-system §4.
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      // ⚠️ `workers` là giới hạn PER-PROJECT trong Playwright ⇒ 2 project
      // vẫn chạy SONG SONG và cùng đụng 1 file SQLite ⇒ race trên slot đã
      // xong (bất biến). `dependencies` buộc desktop chỉ chạy SAU khi
      // mobile xong hẳn.
      dependencies: ["mobile"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    // ⚠️ Dùng **production build** (`next start`), không dùng `next dev`.
    //
    // `next dev` compile route lazy ⇒ lần gọi API đầu tiên tới một route
    // chưa compile có thể trả HTML (trang lỗi) hoặc **mất body request**
    // ⇒ `res.json()` ném "Unexpected token '<'" và `req.json()` ném
    // "Unexpected end of JSON input". Triệu chứng giống hỏng logic ứng dụng
    // nhưng hoàn toàn là hành vi của dev server.
    //
    // Production build compile sẵn toàn bộ route ⇒ ổn định cho E2E.
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
