/**
 * Nạp biến môi trường từ file `.env.local` / `.env`.
 *
 * Vì sao cần: Prisma CLI chỉ đọc `.env`, KHÔNG đọc `.env.local` (Next.js thì đọc
 * `.env.local`). Người dùng copy `.env.example → .env.local` theo README ⇒
 * `prisma migrate dev` và `prisma db seed` sẽ lỗi "Environment variable not found".
 *
 * Module này được import bởi:
 *   - `scripts/prisma-cli.ts` — wrapper cho Prisma CLI
 *   - `prisma/seed.ts`       — seed script
 *
 * Không bao giờ in giá trị `ANTHROPIC_API_KEY` ra console.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Đọc file .env theo format KEY="value" hoặc KEY=value. */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    // Bỏ dấu nháy bao ngoài nếu có.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Không ghi đè biến đã có trong môi trường thật.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Nạp `.env.local` (ưu tiên cao) rồi `.env`, và đặt `DATABASE_URL` mặc định
 * nếu chưa có — SQLite local, không cần DB server.
 */
export function loadEnv(root: string = process.cwd()): void {
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));

  process.env.DATABASE_URL ??= "file:./dev.db";
}
