import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const TestSchema = z.object({
  /** Test key mới (chưa lưu) — nếu có, test key này thay vì key hiện tại. */
  apiKey: z.string().max(200).optional(),
});

/**
 * POST /api/settings/key/test — ping Anthropic endpoint (FR-SC-10).
 *
 * ⚠️ Gọi **1 request tối thiểu** (`max_tokens: 1`, model Haiku) để kiểm tra
 * key hợp lệ / sai / bị giới hạn tần suất / lỗi mạng.
 *
 * ⚠️ KHÔNG ghi key vào log. KHÔNG trả key đầy đủ.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body rỗng vẫn hợp lệ — test key hiện tại.
  }

  const parsed = TestSchema.safeParse(body);
  const testKey =
    parsed.success && parsed.data.apiKey ? parsed.data.apiKey.trim() : env.anthropicApiKey;

  if (!testKey) {
    return toResponse(fail("no_api_key", "Chưa có API key để kiểm tra"));
  }

  try {
    const client = new Anthropic({ apiKey: testKey });

    // ⚠️ 1 request tối thiểu — chỉ để xác thực, không sinh nội dung.
    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });

    return toResponse(ok({ status: "valid" as const }));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return toResponse(fail("invalid_input", "API key không hợp lệ (401)"));
    }
    if (error instanceof Anthropic.RateLimitError) {
      return toResponse(fail("conflict", "Bị giới hạn tần suất (429)"));
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return toResponse(fail("unknown", "Không kết nối được tới Anthropic"));
    }
    if (error instanceof Anthropic.APIError) {
      return toResponse(fail("unknown", `Lỗi API: ${error.status ?? "không rõ"}`));
    }
    return toResponse(fail("unknown", "Lỗi không xác định khi kiểm tra key"));
  }
}
