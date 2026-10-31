import { ok, toResponse } from "@/lib/api-response";
import { getDataStats } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/data/stats — dung lượng DB + số bản ghi từng bảng (FR-SC-26).
 */
export async function GET(): Promise<Response> {
  const stats = await getDataStats();
  return toResponse(ok(stats));
}
