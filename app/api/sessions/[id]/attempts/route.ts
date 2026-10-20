import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import type { SessionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

interface AttemptRow {
  id: number;
  attempt_id: string;
  outcome: string;
  max_tokens: number | null;
  finish_reason: string | null;
  response_chars: number | null;
  raw_response: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: number;
}

/**
 * Scoring diagnostics. Returns every provider round-trip behind the final
 * evaluation, newest first, so a failure can be read back instead of guessed
 * at. Pass `?raw=1` to include the model's untruncated body — useful when the
 * Zod mismatch is something you have to see rather than summarise.
 *
 * `raw_response` holds model output only; no request headers, no credentials.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const session = queryOne<SessionRow>(`SELECT id FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

  const includeRaw = new URL(req.url).searchParams.get("raw") === "1";
  const rows = query<AttemptRow>(
    `SELECT * FROM evaluation_attempts WHERE session_id = ? ORDER BY id DESC LIMIT 20`,
    [params.id],
  );

  return NextResponse.json({
    ok: true,
    attempts: rows.map((r) => ({
      id: r.id,
      attemptId: r.attempt_id,
      outcome: r.outcome,
      maxTokens: r.max_tokens,
      finishReason: r.finish_reason,
      responseChars: r.response_chars,
      durationMs: r.duration_ms,
      error: r.error_message,
      createdAt: r.created_at,
      raw: includeRaw ? r.raw_response : undefined,
    })),
  });
}
