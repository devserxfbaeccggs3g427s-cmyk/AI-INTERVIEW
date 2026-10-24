import { query, queryOne } from "@/lib/db";
import { privateJson } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params { params: { lessonId: string } }

/** Paginate interviews started from this exact saved lesson, newest first. */
export async function GET(req: Request, { params }: Params) {
  const lesson = queryOne<{ id: string }>("SELECT id FROM learning_lessons WHERE id = ?", [params.lessonId]);
  if (!lesson) return privateJson({ error: "Lesson not found" }, { status: 404 });
  const url = new URL(req.url);
  const cursors = url.searchParams.getAll("cursor");
  if (cursors.length > 1 || [...url.searchParams.keys()].some((key) => key !== "cursor")) {
    return privateJson({ error: "Invalid cursor" }, { status: 400 });
  }
  const cursor = cursors[0] ?? null;
  if (cursor !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) {
    return privateJson({ error: "Invalid cursor" }, { status: 400 });
  }
  const position = cursor ? queryOne<{ created_at: number; id: string }>(
    "SELECT created_at, id FROM sessions WHERE id = ? AND origin_lesson_id = ?",
    [cursor, params.lessonId],
  ) : null;
  if (cursor && !position) return privateJson({ error: "Invalid cursor" }, { status: 400 });
  const limit = 20;
  const rows = query<{ id: string; role: string; status: string; created_at: number; overall_score: number | null }>(
    `SELECT s.id, s.role, s.status, s.created_at, e.overall_score
     FROM sessions s LEFT JOIN evaluations e ON e.session_id = s.id
     WHERE s.origin_lesson_id = ?
       AND (? IS NULL OR s.created_at < ? OR (s.created_at = ? AND s.id < ?))
     ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    [params.lessonId, cursor, position?.created_at ?? null, position?.created_at ?? null, position?.id ?? null, limit + 1],
  );
  const hasMore = rows.length > limit;
  const sessions = rows.slice(0, limit).map((row) => ({
    id: row.id, role: row.role, status: row.status, createdAt: row.created_at, overallScore: row.overall_score,
  }));
  return privateJson({ sessions, nextCursor: hasMore ? sessions.at(-1)?.id : null, hasMore });
}
