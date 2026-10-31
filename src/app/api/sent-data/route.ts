import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { deleteSentData, listSentData } from "@/lib/journal";

export const dynamic = "force-dynamic";

/**
 * GET /api/sent-data — panel "Dữ liệu đã gửi lên" (FR-PSJ-04).
 *
 * ⚠️ Cho phép xoá log (không xoá dữ liệu gốc) — FR-PS-07.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));

  const items = await listSentData(limit);
  return toResponse(ok({ items }));
}

/**
 * DELETE /api/sent-data?id= — xoá 1 dòng log.
 */
export async function DELETE(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = z.string().min(1).safeParse(url.searchParams.get("id"));

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "Thiếu id"));
  }

  await deleteSentData(parsed.data);
  return toResponse(ok({ deleted: true }));
}
