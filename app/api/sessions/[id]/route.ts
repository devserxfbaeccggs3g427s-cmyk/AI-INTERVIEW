import { query, queryOne, exec } from "@/lib/db";
import type { MessageTurnRow, SessionRow } from "@/lib/types";
import { env } from "@/lib/env";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { enterOperation } from "@/lib/maintenance";

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
  if (!session) return privateJson({ error: "Not found" }, { status: 404 });

  const turns = query<MessageTurnRow>(
    `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, role, id`,
    [params.id],
  );
  const cv = query<{ source: string; filename: string | null; text: string; char_count: number }>(
    `SELECT source, filename, text, char_count FROM cv_extracts WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    [params.id],
  );
  return privateJson({ session, turns, cv });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const release = enterOperation();
  if (!release) return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  try {
    exec(`DELETE FROM sessions WHERE id = ?`, [params.id]);
    return privateJson({ ok: true });
  } finally {
    release();
  }
}
