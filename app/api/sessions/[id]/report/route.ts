import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { safeParseStoredReport } from "@/lib/zod-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = queryOne<{ report_json: string; overall_score: number | null; recommendation: string | null }>(
    `SELECT report_json, overall_score, recommendation FROM evaluations WHERE session_id = ?`,
    [params.id],
  );
  if (!row) return NextResponse.json({ ok: false, error: "No report" }, { status: 404 });
  const parsed = safeParseStoredReport(row.report_json);
  return NextResponse.json({ ok: true, report: parsed });
}
