import { NextResponse } from "next/server";
import { query, queryOne, exec } from "@/lib/db";
import type { MessageTurnRow, SessionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = queryOne<SessionRow>(
    `SELECT s.*, e.overall_score, e.recommendation
     FROM sessions s LEFT JOIN evaluations e ON e.session_id = s.id
     WHERE s.id = ?`, [params.id],
  );
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const turns = query<MessageTurnRow>(
    `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, role, id`,
    [params.id],
  );
  const cv = query<{ source: string; filename: string | null; text: string; char_count: number }>(
    `SELECT source, filename, text, char_count FROM cv_extracts WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    [params.id],
  );
  return NextResponse.json({ session, turns, cv });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  exec(`DELETE FROM sessions WHERE id = ?`, [params.id]);
  return NextResponse.json({ ok: true });
}
