import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { buildSessionQueue, type SrsLang } from "@/lib/srs";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  lang: z.enum(["zh", "en"]).default("zh"),
});

/**
 * GET /api/srs/next?lang= — queue thẻ cho phiên ôn (AC-LG-2..4).
 *
 * ⚠️ AC-LG-2 — đến hạn trước, thẻ mới sau.
 * ⚠️ AC-LG-3 — tối đa 20 thẻ/phiên.
 * ⚠️ AC-LG-10 — đổi ngôn ngữ giữa phiên không trộn thẻ.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lang: url.searchParams.get("lang") ?? undefined,
  });

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "lang phải là zh hoặc en"));
  }

  const cards = await buildSessionQueue(parsed.data.lang as SrsLang);

  return toResponse(
    ok({
      lang: parsed.data.lang,
      cards,
      total: cards.length,
      // Số thẻ đến hạn = thẻ có `reps > 0` hoặc `due <= now`.
      dueCount: cards.filter((c) => c.reps > 0).length,
      newCount: cards.filter((c) => c.reps === 0).length,
    }),
  );
}
