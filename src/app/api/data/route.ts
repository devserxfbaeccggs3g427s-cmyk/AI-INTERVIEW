import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { isValidWipeConfirmation, wipeUserData } from "@/lib/settings";

export const dynamic = "force-dynamic";

const WipeSchema = z.object({
  /**
   * ⚠️ FR-SC-25 — xác nhận 2 bước: bước 2 phải gõ đúng `XOA`.
   */
  confirmation: z.string(),
});

/**
 * DELETE /api/data — xoá trắng dữ liệu người dùng (FR-SC-25).
 *
 * ⚠️ Bước 1 (UI) mở hộp thoại cảnh báo; bước 2 gõ `XOA`.
 * ⚠️ KHÔNG xoá `Skill` + `Card` (seed lõi) — chỉ dữ liệu người dùng.
 */
export async function DELETE(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = WipeSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "Thiếu xác nhận"));
  }

  // ⚠️ FR-SC-25 — phải gõ đúng "XOA".
  if (!isValidWipeConfirmation(parsed.data.confirmation)) {
    return toResponse(
      fail("invalid_input", "Xác nhận không đúng — phải gõ chính xác XOA"),
    );
  }

  const result = await wipeUserData();
  return toResponse(ok(result));
}
