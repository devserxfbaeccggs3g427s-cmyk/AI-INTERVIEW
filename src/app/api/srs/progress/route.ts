import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getSrsProgress, type SrsLang } from "@/lib/srs";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  lang: z.enum(["zh", "en"]).default("zh"),
});

/**
 * GET /api/srs/progress?lang= — tiến độ ôn tập (AC-LG-6).
 *
 * ⚠️ P3/P7 — đếm bằng chứng (số thẻ đã thuộc / đang học / chưa học),
 * KHÔNG hiển thị % hoàn thành mơ hồ.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lang: url.searchParams.get("lang") ?? undefined,
  });

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "lang phải là zh hoặc en"));
  }

  const progress = await getSrsProgress(parsed.data.lang as SrsLang);
  return toResponse(ok(progress));
}
