import { PrismaClient } from "@prisma/client";

/**
 * Prisma client for **test environments only** (vitest + Playwright).
 *
 * KHÔNG có `import "server-only"` — cho phép import từ test file chạy trong Node.
 * Chỉ dùng trong `tests/` (unit, integration, e2e).
 *
 * Dùng `globalThis` để tái dùng instance giữa các test (giống `db.ts`).
 */
const globalForPrismaTest = globalThis as unknown as {
  prismaTest: PrismaClient | undefined;
};

function createTestClient(): PrismaClient {
  const client = new PrismaClient({
    log: ["warn", "error"],
  });

  void client.$queryRawUnsafe("PRAGMA journal_mode = wal;").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA busy_timeout = 5000;").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA foreign_keys = ON;").catch(() => {});

  return client;
}

export const prisma: PrismaClient = globalForPrismaTest.prismaTest ?? createTestClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrismaTest.prismaTest = prisma;
}

export default prisma;