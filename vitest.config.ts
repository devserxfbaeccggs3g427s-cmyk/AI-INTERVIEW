import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Package `server-only` cố ý ném lỗi khi bị import ngoài RSC. Vitest
      // chạy Node thuần nên không có RSC bundler → alias sang module rỗng để
      // test import được `@/lib/db` / `@/lib/ai/router`.
      // `next build` KHÔNG bị ảnh hưởng — alias chỉ tồn tại trong Vitest.
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // ⚠️ BẮT BUỘC — test KHÔNG được đụng `prisma/dev.db` (DB thật).
    //
    // Vitest không load `.env` (Next.js thì có) → `process.env.DATABASE_URL`
    // bị undefined → Prisma fallback sang `.env` → `file:./dev.db`.
    // Test `POST /api/wipe` (§17.7) xoá sạch toàn bộ bảng → sẽ xoá mất dữ
    // liệu thật của người dùng.
    //
    // `file:./test.db` được Prisma resolve **tương đối so với thư mục
    // schema** (`prisma/`) → `prisma/test.db`.
    env: {
      DATABASE_URL: "file:./test.db",
      // ⚠️ Cũng phải cô lập `.env.local` — nếu không, test đọc **key thật** của
      // máy dev (AC-16: key chỉ nằm ở `.env.local`). `readEnvLocalKeyCached()`
      // sẽ trả key đó → test "thiếu API key → fallback sang local" fail trên
      // máy đã cấu hình key, và test có thể vô tình gọi API thật.
      // Trỏ tới 1 path **không tồn tại** → `readEnvLocalKeyCached()` = null →
      // router fallback về `process.env.ANTHROPIC_API_KEY` như trước.
      ENV_LOCAL_PATH: path.join(os.tmpdir(), "daily-loop-os-vitest-no-env-local"),
    },
    // Chuẩn bị `prisma/test.db` (schema + seed) trước khi test chạy.
    globalSetup: ["./tests/global-setup.ts"],
    // Test DB dùng chung cho integration — chạy tuần tự để tránh race.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
