import { fail, ok, toResponse } from "@/lib/api-response";
import { exportAiCallsCsv, listAiCalls } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/calls?limit=&format=csv — nhật ký gọi API (FR-SC-19..21).
 *
 * `format=csv` ⇒ trả file CSV tải xuống (UTF-8, cột tiếng Việt).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const format = url.searchParams.get("format");

  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return toResponse(fail("invalid_input", "limit phải trong 1..500"));
  }

  if (format === "csv") {
    const csv = await exportAiCallsCsv(limit);
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-calls-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const items = await listAiCalls(limit);
  return toResponse(ok({ items }));
}
