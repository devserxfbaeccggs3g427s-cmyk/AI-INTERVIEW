import { fail, ok, toResponse } from "@/lib/api-response";
import { listPrivacyLog } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/data/privacy-log — nhật ký "dữ liệu nào đã gửi lên" (FR-SC-27).
 *
 * ⚠️ FR-PS-07 — minh bạch: mỗi lần gọi AI lưu loại dữ liệu đã gửi.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");

  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return toResponse(fail("invalid_input", "limit phải trong 1..500"));
  }

  const items = await listPrivacyLog(limit);
  return toResponse(ok({ items }));
}
