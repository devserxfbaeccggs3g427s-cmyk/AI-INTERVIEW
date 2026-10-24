import { queryOne } from "@/lib/db";
import { readyPracticeLesson } from "@/lib/lesson-practice";
import { privateJson } from "@/lib/origin-guard";
import { parseLesson, publicLesson } from "@/lib/learning-schema";
import { loadLearningSource } from "@/lib/learning-source";
import type { LearningLessonRow } from "@/lib/learning-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteParams { params: { lessonId: string } }

export async function GET(_req: Request, { params }: RouteParams) {
  const row = queryOne<LearningLessonRow>(
    `SELECT l.* FROM learning_lessons l JOIN sessions s ON s.id = l.session_id WHERE l.id = ?`,
    [params.lessonId],
  );
  if (!row) return privateJson({ error: "Lesson not found" }, { status: 404 });
  const source = loadLearningSource(row.session_id, row.source_kind, row.source_index);
  const oldRevision = source?.reportRevision !== row.report_revision;
  const session = queryOne<{ role: string; language: "vi" | "en" }>(
    `SELECT role,language FROM sessions WHERE id = ?`, [row.session_id],
  );
  if (!session) return privateJson({ error: "Lesson not found" }, { status: 404 });
  const content = row.status === "ready" ? parseLesson(row.lesson_json) : null;
  if (row.status === "ready" && !content) return privateJson({ error: "Lesson unavailable" }, { status: 404 });
  return privateJson({
    lesson: {
      id: row.id, sessionId: row.session_id, status: row.status, mode: row.mode,
      source: { kind: row.source_kind, index: row.source_index, label: row.source_label,
        context: row.source_context ?? "", role: session.role, language: session.language },
      practiceFocus: row.status === "ready" ? readyPracticeLesson(row.id)?.focus ?? null : null,
      ...(content ? { content: publicLesson(content) } : {}),
    },
    oldRevision,
  });
}
