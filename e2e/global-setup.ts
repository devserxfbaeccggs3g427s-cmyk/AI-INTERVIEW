import { execFileSync } from "node:child_process";

/**
 * Global setup cho Playwright — chuẩn hoá DB + warm-up server trước khi chạy E2E.
 *
 * ⚠️ Slot `done` là **bất biến** (FR-DL-06): API không xoá được slot đã xong.
 * Nếu không reset DB, test chạy 2 lần sẽ thất bại vì slot đã xong từ lần trước.
 *
 * Chạy `npm run db:seed` — xoá sạch dữ liệu nghiệp vụ rồi nạp lại dữ liệu tĩnh.
 */
export default async function globalSetup(): Promise<void> {
  const root = process.cwd();

  execFileSync("npm", ["run", "db:seed"], {
    cwd: root,
    stdio: "inherit",
  });

  await warmUp();
}

/**
 * Warm-up dev server — Next.js compile route lazy, nên lần `page.goto()` đầu
 * tiên có thể mất hơn 30s (timeout mặc định của Playwright) và fail với
 * "navigating to ... timeout".
 *
 * Gọi sẵn `/` và `/plan` để Next.js build xong trước khi test bắt đầu.
 */
async function warmUp(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  // ⚠️ Phải warm-up **cả API route** — Next.js compile route lazy, nên lần
  // gọi đầu tiên tới route đó có thể trả HTML (trang lỗi) thay vì JSON ⇒
  // `res.json()` ném "Unexpected token '<'", hoặc body request bị mất.
  const routes = ["/", "/plan", "/api/plan", "/api/plan/generate"];

  for (const route of routes) {
    try {
      const isGenerate = route.endsWith("/generate");
      await fetch(`${baseURL}${route}`, {
        method: isGenerate ? "POST" : "GET",
        headers: isGenerate ? { "Content-Type": "application/json" } : undefined,
        body: isGenerate ? JSON.stringify({ mode: "fallback" }) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // Server chưa sẵn sàng — Playwright `webServer` sẽ khởi động lại;
      // không cần fail ở đây.
    }
  }

  await warmUpMutatingRoutes(baseURL);
}

/**
 * Warm-up các route **ghi dữ liệu**.
 *
 * ⚠️ Dùng ngày 2099 ⇒ không có `PlanItem` ⇒ server trả 404/400 nhưng route
 * **đã compile**, nên không tạo Activity/Evidence nào lọt vào DB.
 *
 * Bỏ qua bước này thì lần gọi đầu tiên của test tới route bị mất body
 * (`req.json()` ném) ⇒ test fail với triệu chứng giống hỏng logic.
 */
async function warmUpMutatingRoutes(baseURL: string): Promise<void> {
  const json = { "Content-Type": "application/json" };
  const farFuture = "2099-01-01";

  const calls: Array<{ url: string; method: string; body?: string }> = [
    {
      url: `${baseURL}/api/plan/${farFuture}/complete`,
      method: "POST",
      body: JSON.stringify({ slot: 0 }),
    },
    {
      url: `${baseURL}/api/plan/${farFuture}/complete`,
      method: "DELETE",
      body: JSON.stringify({ slot: 0 }),
    },
    {
      url: `${baseURL}/api/plan/${farFuture}/apply`,
      method: "POST",
      body: JSON.stringify({ items: [] }),
    },
    {
      url: `${baseURL}/api/plan/items`,
      method: "PATCH",
      body: JSON.stringify({ date: farFuture, items: [], apply: false }),
    },
  ];

  for (const call of calls) {
    try {
      await fetch(call.url, {
        method: call.method,
        headers: json,
        body: call.body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // Bỏ qua — server sẽ compile ở request thật.
    }
  }
}
