/**
 * Helper — quản lý DB **test** (tách biệt hoàn toàn khỏi DB dev).
 *
 * ⚠️ VÌ SAO CẦN FILE NÀY
 *
 * Khi chạy `vitest`, `process.env.DATABASE_URL` **không** được set (Next.js
 * tự load `.env` khi chạy app, nhưng Vitest thì không). Prisma vì vậy
 * fallback sang `.env` → `file:./dev.db` → **DB thật của người dùng**.
 *
 * Test §17.7 (`POST /api/wipe`) xoá sạch toàn bộ bảng → nếu chạy trên
 * `dev.db` thì **xoá mất dữ liệu thật**. Điều này đã xảy ra 1 lần → phải
 * cô lập.
 *
 * Cách khắc phục:
 *   1. `vitest.config.ts` đặt `test.env.DATABASE_URL = "file:./test.db"`
 *      → mọi test file dùng `prisma/test.db`.
 *   2. `tests/global-setup.ts` gọi `resetTestDb()` trước khi test chạy:
 *      đồng bộ schema + seed dữ liệu mẫu.
 *
 * `file:./test.db` được Prisma resolve **tương đối so với thư mục schema**
 * (`prisma/`) → `prisma/test.db`.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

/** Thư mục gốc project. */
const ROOT = path.resolve(__dirname, "..", "..");

/** URL của DB test — tương đối so với thư mục `prisma/`. */
export const TEST_DATABASE_URL = "file:./test.db";

/** Env cho child process — ép `DATABASE_URL` trỏ vào DB test. */
function testEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
}

/**
 * Đồng bộ schema của DB test với `prisma/schema.prisma`.
 *
 * Tạo file `prisma/test.db` + các bảng nếu chưa có (file bị gitignore).
 */
export function pushSchema(): void {
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: testEnv(),
    stdio: "ignore",
  });
}

/**
 * Seed lại DB test bằng đúng script seed của app (`prisma/seed.ts`).
 *
 * Script seed là **idempotent** (xoá dữ liệu cũ rồi tạo lại) → luôn cho
 * cùng một trạng thái đầu vào cho mỗi lần chạy suite.
 */
export function seedTestDb(): void {
  execFileSync("npx", ["prisma", "db", "seed"], {
    cwd: ROOT,
    env: testEnv(),
    stdio: "ignore",
  });
}

/** Đồng bộ schema + seed — dùng cho global setup và để khôi phục sau wipe. */
export function resetTestDb(): void {
  pushSchema();
  seedTestDb();
}
