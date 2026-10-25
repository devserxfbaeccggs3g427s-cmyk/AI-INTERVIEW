import { queryOne } from "./db";
import { parseLesson, type LearningMode } from "./learning-schema";
import { practiceFocusLabel } from "./practice-prefill";

interface PracticeLessonRow {
  id: string;
  mode: LearningMode;
  session_id: string;
  source_kind: "improvement" | "next_step";
  source_index: number;
  source_label: string;
  status: string;
  lesson_json: string | null;
}

/** Read the saved lesson snapshot, not the current report (which may have changed). */
export function readyPracticeLesson(id: string) {
  const row = queryOne<PracticeLessonRow>(
    `SELECT id, mode, session_id, source_kind, source_index, source_label, status, lesson_json
     FROM learning_lessons WHERE id = ?`, [id],
  );
  if (!row || row.status !== "ready" || !parseLesson(row.lesson_json, row.mode)) return null;
  const focus = practiceFocusLabel(row.source_label);
  return focus ? { id: row.id, sessionId: row.session_id, kind: row.source_kind,
    index: row.source_index, label: row.source_label, focus } : null;
}
