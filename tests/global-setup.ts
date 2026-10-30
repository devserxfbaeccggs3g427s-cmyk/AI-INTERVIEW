/**
 * Global setup — chuẩn bị DB **test** trước khi Vitest chạy.
 *
 * ⚠️ VÌ SAO CẦN
 *
 * Khi chạy Vitest, `process.env.DATABASE_URL` **không** được set (Next.js tự
 * load `.env` khi chạy app, Vitest thì không). Prisma vì vậy fallback sang
 * `.env` → `file:./dev.db` → **DB thật của người dùng**.
 *
 * Test §17.7 (`POST /api/wipe`) xoá sạch toàn bộ bảng → chạy trên `dev.db`
 * thì **xoá mất dữ liệu thật** (đã xảy ra 1 lần → phải cô lập).
 *
 * Cách khắc phục:
 *   1. `vitest.config.ts` đặt `test.env.DATABASE_URL = "file:./test.db"`
 *      → mọi test dùng `prisma/test.db` (tương đối so với thư mục schema).
 *   2. File này xoá DB test cũ → `db push` (đồng bộ schema) → `db seed`
 *      (dữ liệu mẫu giống hệt app thật).
 *
 * `prisma/test.db` bị gitignore (`*.db`) → không bao giờ commit lên repo.
 */

import { resetTestDb } from "./helpers/test-db";

export default function setup(): void {
  resetTestDb();
}
