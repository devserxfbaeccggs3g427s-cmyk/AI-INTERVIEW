import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { env } from "@/lib/env";
import { getKeyStatus, removeEnvVar, upsertEnvVar } from "@/lib/env-file";

export const dynamic = "force-dynamic";

/**
 * API key Anthropic (FR-SC-08..13).
 *
 * ⚠️ FR-SC-11 — key **chỉ** hiện dạng che. Payload không bao giờ chứa key
 * đầy đủ.
 *
 * ⚠️ FR-SC-08 — ghi vào `.env.local` (atomic, `chmod 600`), KHÔNG đụng `.env`
 * (file chứa `DATABASE_URL` cho Prisma CLI) và không đụng biến khác.
 */

const KeySchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .max(200)
    .regex(/^sk-ant-[A-Za-z0-9_-]{10,}$/, "apiKey không đúng định dạng"),
});

/**
 * GET /api/settings/key — trạng thái key hiện tại (FR-SC-09, FR-SC-11).
 *
 * ⚠️ Chỉ trả dạng che, KHÔNG bao giờ trả key đầy đủ.
 */
export async function GET(): Promise<Response> {
  const status = await getKeyStatus();

  return toResponse(
    ok({
      hasKey: status.configured,
      // `masked` đã che sẵn trong `getKeyStatus`.
      maskedKey: status.masked ?? (env.anthropicApiKey ? env.maskedKey : null),
      source: status.source,
      // ⚠️ FR-SC-12 — cần restart dev server để có hiệu lực.
      needsRestart: false,
    }),
  );
}

/**
 * PUT /api/settings/key — lưu key mới vào `.env.local` (FR-SC-08, FR-SC-12).
 *
 * ⚠️ FR-SC-12 — biến môi trường đã nạp lúc start ⇒ cần restart ⇒ trả
 * `needsRestart: true`.
 */
export async function PUT(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = KeySchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", "API key không đúng định dạng (phải bắt đầu bằng sk-ant-)"),
    );
  }

  const apiKey = parsed.data.apiKey.trim();

  try {
    await upsertEnvVar("ANTHROPIC_API_KEY", apiKey);

    // ⚠️ Cập nhật `process.env` để request kế tiếp dùng key mới ngay
    // (không cần restart cho request này — UI vẫn hiện banner restart vì
    // các module đã import `env` sẽ cần nạp lại).
    process.env.ANTHROPIC_API_KEY = apiKey;

    const status = await getKeyStatus();

    return toResponse(
      ok({
        saved: true,
        maskedKey: status.masked,
        // ⚠️ FR-SC-12 — cần khởi động lại dev server.
        needsRestart: true,
      }),
    );
  } catch {
    return toResponse(
      fail(
        "unknown",
        "Không ghi được .env.local — kiểm tra quyền ghi của thư mục dự án",
      ),
    );
  }
}

/**
 * DELETE /api/settings/key — xoá key khỏi `.env.local` (FR-SC-13).
 *
 * ⚠️ Chỉ xoá đúng dòng `ANTHROPIC_API_KEY=` — giữ nguyên biến khác.
 * ⚠️ App quay về offline mode ở request kế tiếp.
 */
export async function DELETE(): Promise<Response> {
  try {
    await removeEnvVar("ANTHROPIC_API_KEY");
    delete process.env.ANTHROPIC_API_KEY;

    return toResponse(ok({ deleted: true, needsRestart: true }));
  } catch {
    return toResponse(fail("unknown", "Không xoá được key khỏi .env.local"));
  }
}
