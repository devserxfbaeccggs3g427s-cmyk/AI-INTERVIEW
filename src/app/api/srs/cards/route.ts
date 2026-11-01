import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { createManualCard, exportDeck, type SrsLang } from "@/lib/srs";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  lang: z.enum(["zh", "en"]),
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(500),
  frontAlt: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  example: z.string().max(500).nullable().optional(),
  group: z.string().max(60).nullable().optional(),
});

/**
 * GET /api/srs/cards?lang=&format=json — xuất deck (AC-LG-12).
 *
 * `format=json` ⇒ payload JSON để tải về.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") ?? "zh";

  if (lang !== "zh" && lang !== "en") {
    return toResponse(fail("invalid_input", "lang phải là zh hoặc en"));
  }

  const deck = await exportDeck(lang as SrsLang);

  return new Response(JSON.stringify(deck, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="srs-deck-${lang}.json"`,
    },
  });
}

/**
 * POST /api/srs/cards — thêm thẻ thủ công (AC-LG-11).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const card = await createManualCard(parsed.data);
  return toResponse(ok(card));
}
