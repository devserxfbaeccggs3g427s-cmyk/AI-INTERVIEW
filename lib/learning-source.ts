import { createHash } from "node:crypto";
import { queryOne } from "./db";
import { SourceKindSchema, type SourceKind } from "./learning-schema";
import { safeParseStoredReport } from "./zod-schemas";

export interface LearningSource {
  sessionId: string;
  reportRevision: string;
  kind: SourceKind;
  index: number;
  role: string;
  language: "vi" | "en";
  /** Bounded snapshot label (the full original report item is in `source`). */
  label: string;
  /** Bounded snapshot context; empty for improvements. */
  context: string;
  source: string | { title: string; description: string; duration: string };
}

/** Resolve a single indexed item from a completed session's valid, persisted report. */
export function loadLearningSource(sessionId: string, kind: SourceKind, index: number): LearningSource | null {
  if (typeof sessionId !== "string" || !sessionId || !SourceKindSchema.safeParse(kind).success ||
      !Number.isSafeInteger(index) || index < 0) return null;

  // Never select CV, turns, raw evaluation blocks, or other report fields.
  const row = queryOne<{
    role: string; language: "vi" | "en"; report_json: string;
  }>(
    `SELECT s.role, s.language, e.report_json
     FROM sessions s JOIN evaluations e ON e.session_id = s.id
     WHERE s.id = ? AND s.status = 'completed'`,
    [sessionId],
  );
  if (!row || typeof row.report_json !== "string") return null;
  const report = safeParseStoredReport(row.report_json);
  if (!report) return null;

  const source = kind === "improvement" ? report.improvements[index] : report.next_steps[index];
  if (source === undefined) return null;
  const reportRevision = createHash("sha256").update(row.report_json, "utf8").digest("hex");
  if (kind === "improvement") {
    return { sessionId, reportRevision, kind, index, role: row.role, language: row.language,
      label: (source as string).slice(0, 120), context: "", source: source as string };
  }
  const step = source as typeof report.next_steps[number];
  // Retain the original duration even when the description exceeds snapshot capacity.
  const context = `${step.description.slice(0, 500 - step.duration.length - 1)}\n${step.duration}`;
  return { sessionId, reportRevision, kind, index, role: row.role, language: row.language,
    label: step.title, context, source: step };
}
