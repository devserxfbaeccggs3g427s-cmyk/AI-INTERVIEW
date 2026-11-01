import { fail, ok, toResponse } from "@/lib/api-response";
import { listAttempts } from "@/lib/speak";

export const dynamic = "force-dynamic";

/**
 * GET /api/speak/history?mode=&limit= — lịch sử lượt luyện.
 *
 * ⚠️ Dùng để tính delta (AC-CM-3).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const limit = Number(url.searchParams.get("limit") ?? "20");

  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return toResponse(fail("invalid_input", "limit phải trong 1..200"));
  }

  const items = await listAttempts({
    ...(mode ? { mode } : {}),
    limit,
  });

  return toResponse(ok({ items }));
}
