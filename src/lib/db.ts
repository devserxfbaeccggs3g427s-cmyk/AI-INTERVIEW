import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * - Dùng `globalThis` để không tạo nhiều instance khi Next.js hot-reload.
 * - `PRAGMA WAL` + `busy_timeout` để tránh `SQLITE_BUSY` khi ghi đồng thời.
 * - Xem tasks.md 1.7.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // PRAGMA phải chạy ngoài transaction nên dùng $queryRawUnsafe.
  void client.$queryRawUnsafe("PRAGMA journal_mode = wal;").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA busy_timeout = 5000;").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA foreign_keys = ON;").catch(() => {});

  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
