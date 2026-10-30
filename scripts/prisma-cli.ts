/**
 * Wrapper cho Prisma CLI.
 *
 * Vì sao cần: Prisma CLI chỉ đọc `.env`, KHÔNG đọc `.env.local` (Next.js thì đọc
 * `.env.local`). Nếu người dùng chỉ copy `.env.example → .env.local` (theo hướng dẫn
 * trong README) thì `prisma migrate dev` sẽ lỗi "Environment variable not found".
 *
 * Logic nạp env nằm trong `scripts/load-env.ts` — dùng chung với `prisma/seed.ts`.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { loadEnv } from "./load-env";

const ROOT = resolve(import.meta.dirname, "..");

loadEnv(ROOT);

const args = process.argv.slice(2);
const prismaBin = resolve(ROOT, "node_modules", ".bin", "prisma");

const child = spawn(prismaBin, args, {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error("Không chạy được Prisma CLI:", error.message);
  process.exit(1);
});
