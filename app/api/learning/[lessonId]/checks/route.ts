import { createHash, randomUUID } from "node:crypto";

import { getDb, query, queryOne, runInTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { learningAttemptDto, MAX_LEARNING_ATTEMPTS, type LearningAttemptRow } from "@/lib/learning-attempts";
import { gradeAnswers } from "@/lib/learning-check";
import { AttemptInputSchema, parseLesson } from "@/lib/learning-schema";
import { enterOperation } from "@/lib/maintenance";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { safeParseStoredReport } from "@/lib/zod-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

interface RouteParams { params: { lessonId: string } }
interface LessonRow {
  status: string;
  lesson_json: string | null;
  report_revision: string;
  source_kind: "improvement" | "next_step";
  source_index: number;
  session_status: string;
  report_json: string | null;
}

function loadLesson(lessonId: string, allowHistorical: boolean) {
  const row = queryOne<LessonRow>(
    `SELECT l.status, l.lesson_json, l.report_revision, l.source_kind, l.source_index,
            s.status AS session_status, e.report_json
       FROM learning_lessons l
       JOIN sessions s ON s.id = l.session_id
       LEFT JOIN evaluations e ON e.session_id = s.id
      WHERE l.id = ?`,
    [lessonId],
  );
  if (!row) return { ok: false as const, status: 404, error: "Lesson not found" };
  if (row.status !== "ready" || !row.lesson_json) {
    return { ok: false as const, status: 409, error: "Lesson is not ready" };
  }
  const lesson = parseLesson(row.lesson_json);
  if (!lesson) return { ok: false as const, status: 409, error: "Lesson is unavailable" };
  // A previous report's immutable lesson may still be opened read-only. Results
  // already earned on it are readable, but submission always checks the latest
  // validated report and its exact stored-byte digest inside the write transaction.
  if (!allowHistorical) {
    const report = row.report_json && safeParseStoredReport(row.report_json);
    if (row.session_status !== "completed" || !report ||
        createHash("sha256").update(row.report_json!).digest("hex") !== row.report_revision ||
        (row.source_kind === "improvement"
          ? !report.improvements[row.source_index]
          : !report.next_steps[row.source_index])) {
      return { ok: false as const, status: 409, error: "Lesson belongs to a previous or unavailable report" };
    }
  }
  return { ok: true as const, lesson };
}

async function readInput(req: Request): Promise<{ value?: unknown; status?: number; error?: string }> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get("content-type") ?? "")) {
    return { status: 415, error: "Expected application/json" };
  }
  const length = req.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_BODY_BYTES) {
    return { status: 413, error: "Attempt exceeds size limit" };
  }
  if (!req.body) return { status: 400, error: "Missing attempt" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: 413, error: "Attempt exceeds size limit" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { status: 400, error: "Invalid JSON attempt" };
  } finally {
    reader.releaseLock();
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const release = enterOperation();
  if (!release) return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  try {
    const check = loadLesson(params.lessonId, true);
    if (!check.ok) return privateJson({ ok: false, error: check.error }, { status: check.status });
    const rows = query<LearningAttemptRow>(
      `SELECT id, client_attempt_id, answers_json, score, total, created_at
         FROM learning_check_attempts WHERE lesson_id = ? ORDER BY created_at, rowid LIMIT ?`,
      [params.lessonId, MAX_LEARNING_ATTEMPTS],
    );
    return privateJson({ ok: true, attempts: rows.map((row) => learningAttemptDto(row, check.lesson)) });
  } finally {
    release();
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const release = enterOperation();
  if (!release) return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  try {
    const input = await readInput(req);
    if (input.status) return privateJson({ ok: false, error: input.error }, { status: input.status });
    const parsed = AttemptInputSchema.safeParse(input.value);
    if (!parsed.success) return privateJson({ ok: false, error: "Invalid attempt" }, { status: 400 });
    const { clientAttemptId, answers } = parsed.data;
    let outcome: { status: number; error: string } | { attempt: ReturnType<typeof learningAttemptDto> } | undefined;
    runInTransaction("IMMEDIATE", () => {
      const check = loadLesson(params.lessonId, false);
      if (!check.ok) {
        outcome = { status: check.status, error: check.error };
        return;
      }
      if (answers.length !== check.lesson.questions.length) {
        outcome = { status: 400, error: "Answer every question exactly once" };
        return;
      }
      const existing = queryOne<LearningAttemptRow>(
        `SELECT id, client_attempt_id, answers_json, score, total, created_at
           FROM learning_check_attempts WHERE lesson_id = ? AND client_attempt_id = ?`,
        [params.lessonId, clientAttemptId],
      );
      if (existing) {
        const savedAnswers: unknown = JSON.parse(existing.answers_json);
        if (JSON.stringify(savedAnswers) !== JSON.stringify(answers)) {
          outcome = { status: 409, error: "Attempt ID was already used with different answers" };
        } else {
          outcome = { attempt: learningAttemptDto(existing, check.lesson) };
        }
        return;
      }
      const count = queryOne<{ count: number }>(
        `SELECT count(*) AS count FROM learning_check_attempts WHERE lesson_id = ?`, [params.lessonId],
      )!.count;
      if (count >= MAX_LEARNING_ATTEMPTS) {
        outcome = { status: 429, error: "Maximum 20 attempts reached for this lesson" };
        return;
      }
      const grade = gradeAnswers(check.lesson, answers);
      const id = randomUUID();
      const answersJson = JSON.stringify(answers);
      getDb().prepare(`INSERT INTO learning_check_attempts
          (id, lesson_id, client_attempt_id, answers_json, score, total)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, params.lessonId, clientAttemptId, answersJson, grade.score, grade.total);
      const saved = queryOne<LearningAttemptRow>(
        `SELECT id, client_attempt_id, answers_json, score, total, created_at
           FROM learning_check_attempts WHERE id = ?`, [id],
      )!;
      outcome = { attempt: learningAttemptDto(saved, check.lesson) };
    });
    if (!outcome) return privateJson({ ok: false, error: "Could not save attempt" }, { status: 500 });
    if ("error" in outcome) return privateJson({ ok: false, error: outcome.error }, { status: outcome.status });
    return privateJson({ ok: true, attempt: outcome.attempt });
  } finally {
    release();
  }
}
