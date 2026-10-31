import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getLogHistory } from "@/lib/log";
import { parseDateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  domain: z
    .enum(["all", "professional", "communication", "language", "personal"])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/log/history — lịch sử theo ngày + lọc domain (FR-QL-10).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
    domain: url.searchParams.get("domain") ?? "all",
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  const date = parsed.data.date ? parseDateKey(parsed.data.date) : new Date();
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  const result = await getLogHistory({
    date,
    domain: parsed.data.domain,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  return toResponse(ok(result));
}
