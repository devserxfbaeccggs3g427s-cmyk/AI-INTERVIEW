import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { fail, ok, toResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * Route kỹ thuật — smoke test cho CI + healthcheck.
 *
 * KHÔNG tiết lộ giá trị API key (chỉ trả về "configured" | "offline").
 */
export async function GET(): Promise<Response> {
  let db = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  if (!db) {
    return toResponse(
      fail("db_error", "Không kết nối được database — kiểm tra DATABASE_URL"),
    );
  }

  return toResponse(
    ok({
      db,
      ai: env.isOffline ? ("offline" as const) : ("configured" as const),
      version: process.env.npm_package_version ?? "0.1.0",
    }),
  );
}
