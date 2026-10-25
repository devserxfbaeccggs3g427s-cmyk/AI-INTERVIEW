import { createHash } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { z } from "zod";
import { getDb } from "./db";
import { FocusSchema } from "./focus";
import { LESSON_MAX_BYTES, parseLesson } from "./learning-schema";

/** Only the eight application tables are portable; SQLite internals and secrets are not. */
export const TABLE_NAMES = [
  "sessions", "message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "model_configs",
  "learning_lessons", "learning_check_attempts",
] as const;
type TableName = (typeof TABLE_NAMES)[number];
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
const FORMAT = "interview-ai-backup";
const FORMAT_VERSION = 1;
/** The backup file's own format version. It tracks the columns listed below. */
const SCHEMA_VERSION = 4;
/**
 * Database versions whose tables still match that column list. Version 5 only
 * added a nullable diagnostic column that no backup carries, so a v5 database
 * still produces a v4 backup file and old backups still restore into it.
 */
const SUPPORTED_DB_VERSIONS = new Set([4, 5]);

export class BackupError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "BackupError";
  }
}

const text = z.string();
const nullableText = text.nullable();
const integer = z.number().int().safe();
const nullableInteger = integer.nullable();
const real = z.number().finite();
const positiveId = integer.positive();
const focusJson = text.refine((value) => {
  try { return FocusSchema.safeParse(JSON.parse(value)).success; }
  catch { return false; }
}, "Invalid focus_json");
const reportRevision = text.regex(/^[a-f0-9]{64}$/);
const storedLesson = text.refine((value) => {
  if (Buffer.byteLength(value, "utf8") > LESSON_MAX_BYTES) return false;
  try { return parseLesson(JSON.parse(value)) !== null; }
  catch { return false; }
}, "Invalid lesson_json");
const answersJson = text.refine((value) => {
  try {
    const values: unknown = JSON.parse(value);
    return Array.isArray(values) && values.length >= 2 && values.length <= 3 &&
      values.every((answer) => answer === "A" || answer === "B" || answer === "C");
  } catch { return false; }
}, "Invalid answers_json");

// All columns are explicit, including the v1 evaluation and v2 focus columns.
// Unknown columns (including api_key) must not be accepted or accidentally exported.
const rowSchemas = {
  sessions: z.object({
    id: text, role: text, language: z.enum(["vi", "en"]),
    mode: z.enum(["strict", "coaching"]), planned_rounds: integer,
    status: z.enum(["active", "evaluating", "completed", "failed"]),
    provider: text, model: text, base_url: nullableText,
    temperature: real, max_tokens: integer, top_p: real,
    cv_source: z.enum(["none", "paste", "pdf"]).nullable(), cv_filename: nullableText,
    created_at: integer, ended_at: nullableInteger, rubric_json: nullableText,
    error_count: integer, evaluation_started_at: nullableInteger,
    evaluation_attempt_id: nullableText, focus_json: focusJson,
    origin_lesson_id: nullableText,
  }).strict(),
  message_turns: z.object({
    id: positiveId, session_id: text, turn_number: integer,
    role: z.enum(["user", "assistant", "system", "error"]), content: text,
    raw_blocks_json: nullableText, latency_ms: nullableInteger,
    prompt_tokens: nullableInteger, completion_tokens: nullableInteger,
    micro_rubric: nullableText, finish_reason: nullableText, created_at: integer,
  }).strict(),
  cv_extracts: z.object({
    id: positiveId, session_id: text, source: z.enum(["paste", "pdf"]),
    filename: nullableText, text, char_count: integer, created_at: integer,
  }).strict(),
  evaluations: z.object({
    id: positiveId, session_id: text, report_json: text, overall_score: integer,
    recommendation: text, schema_valid: integer, repair_attempts: integer,
    created_at: integer,
  }).strict(),
  evaluation_attempts: z.object({
    id: positiveId, session_id: text, attempt_id: text,
    outcome: z.enum(["completed", "failed"]), max_tokens: nullableInteger,
    finish_reason: nullableText, response_chars: nullableInteger,
    raw_response: nullableText, error_message: nullableText,
    duration_ms: nullableInteger, created_at: integer,
  }).strict(),
  model_configs: z.object({
    provider: text, model: text, base_url: nullableText, temperature: real,
    max_tokens: integer, top_p: real, updated_at: integer,
  }).strict(),
  learning_lessons: z.object({
    id: text.min(1), session_id: text, report_revision: reportRevision,
    source_kind: z.enum(["improvement", "next_step"]), source_index: integer.nonnegative(),
    mode: z.enum(["fundamentals", "answering"]), source_label: text.min(1).max(120),
    source_context: text.max(500).nullable(), status: z.enum(["generating", "ready", "failed"]),
    claim_id: nullableText, claimed_at: nullableInteger, lesson_json: storedLesson.nullable(),
    provider: text, model: text, base_url: nullableText, created_at: integer, updated_at: integer,
  }).strict().superRefine((row, ctx) => {
    if (row.status === "generating" ? !row.claim_id || row.claimed_at === null || row.lesson_json !== null
      : row.status === "ready" ? row.claim_id !== null || row.claimed_at !== null || row.lesson_json === null
        : row.claim_id !== null || row.claimed_at !== null || row.lesson_json !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lesson claim/status" });
    }
    if (row.lesson_json !== null && !parseLesson(row.lesson_json, row.mode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Lesson mode does not match its content" });
    }
  }),
  learning_check_attempts: z.object({
    id: text.min(1), lesson_id: text, client_attempt_id: text.uuid(), answers_json: answersJson,
    score: integer.nonnegative(), total: integer.min(2).max(3), created_at: integer,
  }).strict().refine((row) => row.score <= row.total, "Invalid check score"),
} as const;

const legacyCountsSchema = z.object({
  sessions: integer.nonnegative(), message_turns: integer.nonnegative(),
  cv_extracts: integer.nonnegative(), evaluations: integer.nonnegative(),
  evaluation_attempts: integer.nonnegative(), model_configs: integer.nonnegative(),
}).strict();
const countsSchema = legacyCountsSchema.extend({
  learning_lessons: integer.nonnegative(), learning_check_attempts: integer.nonnegative(),
});
export type BackupCounts = z.infer<typeof countsSchema>;

const backupSchema = z.object({
  format: z.literal(FORMAT), formatVersion: z.literal(FORMAT_VERSION),
  schemaVersion: z.literal(SCHEMA_VERSION), createdAt: z.string().datetime(),
  tables: z.object({
    sessions: z.array(rowSchemas.sessions),
    message_turns: z.array(rowSchemas.message_turns),
    cv_extracts: z.array(rowSchemas.cv_extracts),
    evaluations: z.array(rowSchemas.evaluations),
    evaluation_attempts: z.array(rowSchemas.evaluation_attempts),
    model_configs: z.array(rowSchemas.model_configs),
    learning_lessons: z.array(rowSchemas.learning_lessons),
    learning_check_attempts: z.array(rowSchemas.learning_check_attempts),
  }).strict(), counts: countsSchema,
}).strict();
export type BackupData = z.infer<typeof backupSchema>;
// Validate each historical envelope strictly before projecting to v4.
// v1 had no focus_json; v1/v2 had no learning tables; v1-v3 had no origin_lesson_id.
const v3BackupSchema = backupSchema.extend({
  schemaVersion: z.literal(3),
  tables: backupSchema.shape.tables.extend({
    sessions: z.array(rowSchemas.sessions.omit({ origin_lesson_id: true })),
  }),
});
const v2BackupSchema = v3BackupSchema.extend({
  schemaVersion: z.literal(2),
  tables: v3BackupSchema.shape.tables.omit({ learning_lessons: true, learning_check_attempts: true }),
  counts: legacyCountsSchema,
});
const v1BackupSchema = v2BackupSchema.extend({
  schemaVersion: z.literal(1),
  tables: v2BackupSchema.shape.tables.extend({
    sessions: z.array(rowSchemas.sessions.omit({ focus_json: true, origin_lesson_id: true })),
  }),
});

const columns: { [K in TableName]: readonly (keyof BackupData["tables"][K][number] & string)[] } = {
  sessions: ["id", "role", "language", "mode", "planned_rounds", "status", "provider", "model", "base_url", "temperature", "max_tokens", "top_p", "cv_source", "cv_filename", "created_at", "ended_at", "rubric_json", "error_count", "evaluation_started_at", "evaluation_attempt_id", "focus_json", "origin_lesson_id"],
  message_turns: ["id", "session_id", "turn_number", "role", "content", "raw_blocks_json", "latency_ms", "prompt_tokens", "completion_tokens", "micro_rubric", "finish_reason", "created_at"],
  cv_extracts: ["id", "session_id", "source", "filename", "text", "char_count", "created_at"],
  evaluations: ["id", "session_id", "report_json", "overall_score", "recommendation", "schema_valid", "repair_attempts", "created_at"],
  evaluation_attempts: ["id", "session_id", "attempt_id", "outcome", "max_tokens", "finish_reason", "response_chars", "raw_response", "error_message", "duration_ms", "created_at"],
  model_configs: ["provider", "model", "base_url", "temperature", "max_tokens", "top_p", "updated_at"],
  learning_lessons: ["id", "session_id", "report_revision", "source_kind", "source_index", "mode", "source_label", "source_context", "status", "claim_id", "claimed_at", "lesson_json", "provider", "model", "base_url", "created_at", "updated_at"],
  learning_check_attempts: ["id", "lesson_id", "client_attempt_id", "answers_json", "score", "total", "created_at"],
};
const childrenFirst = ["learning_check_attempts", "learning_lessons", "message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "sessions", "model_configs"] as const;
const autoincrementTables = ["message_turns", "cv_extracts", "evaluations", "evaluation_attempts"] as const;
/** Rows per round trip while scanning. Peak memory is the kept rows plus one batch. */
const BATCH = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function readVersion(): void {
  const version = (getDb().prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (!SUPPORTED_DB_VERSIONS.has(version)) throw new BackupError("Unsupported database schema version", 409);
}

function readCounts(): BackupCounts {
  const result = {} as BackupCounts;
  for (const table of TABLE_NAMES) {
    result[table] = (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  }
  return result;
}

export function countsMatch(actual: BackupCounts, expected: BackupCounts): boolean {
  return TABLE_NAMES.every((table) => actual[table] === expected[table]);
}

/**
 * Walk all eight tables once, in a stable order, handing each row to `onRow`.
 * Keyset paging on rowid keeps the scan O(n); an `OFFSET` scan re-reads the
 * skipped prefix on every batch. Row order is fixed so export bytes and the
 * fingerprint are reproducible from the same data.
 */
function scanTables(onRow: (table: TableName, row: Record<string, unknown>) => void): void {
  for (const table of TABLE_NAMES) {
    // Fixed identifiers only. Explicit column lists ensure extras (including secrets) cannot leak.
    const select = columns[table].map((name) => `"${name}"`).join(", ");
    const head = getDb().prepare(`SELECT rowid AS __rowid, ${select} FROM ${table} ORDER BY rowid LIMIT ?`);
    const page = getDb().prepare(`SELECT rowid AS __rowid, ${select} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`);
    let cursor = 0;
    for (;;) {
      const batch = (cursor === 0 ? head.all(BATCH) : page.all(cursor, BATCH)) as Record<string, unknown>[];
      for (const row of batch) {
        cursor = row.__rowid as number;
        delete row.__rowid; // Keep the exported key order identical to the column list.
        onRow(table, row);
      }
      if (batch.length < BATCH) break;
    }
  }
}

/** SHA-256 over every row in scan order. Must run inside a transaction. */
function fingerprintNow(): string {
  const hash = createHash("sha256");
  // JSON escapes control characters, so newlines delimit unambiguously.
  scanTables((table, row) => hash.update(`${table}\n${JSON.stringify(row)}\n`));
  return hash.digest("hex");
}

/**
 * Content revision of the eight tables. Row counts alone cannot distinguish a
 * reviewed session from a rewritten one that happens to have the same rows.
 */
export function getBackupFingerprint(): string {
  return transaction("DEFERRED", () => {
    readVersion();
    return fingerprintNow();
  });
}

function transaction<T>(mode: "DEFERRED" | "IMMEDIATE", action: () => T): T {
  const db = getDb();
  db.exec(`BEGIN ${mode}`);
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function assertSize(bytes: number): void {
  if (bytes > BACKUP_MAX_BYTES) {
    throw new BackupError("Backup exceeds 50 MiB; use an offline SQLite backup instead", 413);
  }
}

function validate(input: unknown): BackupData {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new BackupError("Invalid backup format", 400);
  }
  const header = input as Record<string, unknown>;
  if (header.formatVersion !== FORMAT_VERSION || (header.schemaVersion !== 1 && header.schemaVersion !== 2 && header.schemaVersion !== 3 && header.schemaVersion !== SCHEMA_VERSION)) {
    throw new BackupError("Unsupported backup version", 422);
  }
  let data: BackupData;
  if (header.schemaVersion === 4) {
    const parsed = backupSchema.safeParse(input);
    if (!parsed.success) throw new BackupError("Invalid backup schema", 422);
    data = parsed.data;
  } else if (header.schemaVersion === 3) {
    const parsed = v3BackupSchema.safeParse(input);
    if (!parsed.success) throw new BackupError("Invalid backup schema", 422);
    data = { ...parsed.data, schemaVersion: SCHEMA_VERSION,
      tables: { ...parsed.data.tables,
        sessions: parsed.data.tables.sessions.map((row) => ({ ...row, origin_lesson_id: null })) } };
  } else if (header.schemaVersion === 2) {
    const parsed = v2BackupSchema.safeParse(input);
    if (!parsed.success) throw new BackupError("Invalid backup schema", 422);
    data = { ...parsed.data, schemaVersion: SCHEMA_VERSION,
      tables: { ...parsed.data.tables,
        sessions: parsed.data.tables.sessions.map((row) => ({ ...row, origin_lesson_id: null })),
        learning_lessons: [], learning_check_attempts: [] },
      counts: { ...parsed.data.counts, learning_lessons: 0, learning_check_attempts: 0 } };
  } else {
    const parsed = v1BackupSchema.safeParse(input);
    if (!parsed.success) throw new BackupError("Invalid backup schema", 422);
    data = { ...parsed.data, schemaVersion: SCHEMA_VERSION,
      tables: { ...parsed.data.tables,
        sessions: parsed.data.tables.sessions.map((row) => ({ ...row, focus_json: "[]", origin_lesson_id: null })),
        learning_lessons: [], learning_check_attempts: [] },
      counts: { ...parsed.data.counts, learning_lessons: 0, learning_check_attempts: 0 } };
  }
  for (const table of TABLE_NAMES) {
    if (data.counts[table] !== data.tables[table].length) {
      throw new BackupError("Backup row counts do not match", 422);
    }
  }
  const sessionIds = new Set<string>();
  const seen = new Set<string>();
  for (const row of data.tables.sessions) {
    if (sessionIds.has(row.id)) throw new BackupError("Duplicate session ID", 422);
    sessionIds.add(row.id);
  }
  for (const row of data.tables.model_configs) {
    if (seen.has(row.provider)) throw new BackupError("Duplicate provider", 422);
    seen.add(row.provider);
  }
  seen.clear();
  for (const table of autoincrementTables) {
    const ids = new Set<number>();
    for (const row of data.tables[table]) {
      if (ids.has(row.id)) throw new BackupError(`Duplicate ${table} ID`, 422);
      ids.add(row.id);
      if (!sessionIds.has(row.session_id)) throw new BackupError(`Orphan ${table} row`, 422);
      if (table === "message_turns") {
        const turn = row as BackupData["tables"]["message_turns"][number];
        const key = JSON.stringify([turn.session_id, turn.turn_number, turn.role]);
        if (seen.has(key)) throw new BackupError("Duplicate session turn", 422);
        seen.add(key);
      }
      if (table === "evaluations") {
        if (seen.has(row.session_id)) throw new BackupError("Duplicate evaluation session", 422);
        seen.add(row.session_id);
      }
    }
    if (table === "message_turns") seen.clear();
  }
  const lessons = new Map<string, BackupData["tables"]["learning_lessons"][number]>();
  const slots = new Set<string>();
  for (const row of data.tables.learning_lessons) {
    if (lessons.has(row.id)) throw new BackupError("Duplicate lesson ID", 422);
    if (!sessionIds.has(row.session_id)) throw new BackupError("Orphan lesson row", 422);
    lessons.set(row.id, row);
    const slot = JSON.stringify([row.session_id, row.report_revision, row.source_kind, row.source_index, row.mode]);
    if (slots.has(slot)) throw new BackupError("Duplicate lesson slot", 422);
    slots.add(slot);
  }
  for (const row of data.tables.sessions) {
    if (row.origin_lesson_id !== null && lessons.get(row.origin_lesson_id)?.status !== "ready") {
      throw new BackupError("Session origin requires ready lesson", 422);
    }
  }
  const checkIds = new Set<string>();
  const checkSlots = new Set<string>();
  for (const row of data.tables.learning_check_attempts) {
    if (checkIds.has(row.id)) throw new BackupError("Duplicate check ID", 422);
    checkIds.add(row.id);
    const lesson = lessons.get(row.lesson_id);
    if (!lesson) throw new BackupError("Orphan check row", 422);
    if (lesson.status !== "ready" || lesson.lesson_json === null) throw new BackupError("Check requires ready lesson", 422);
    const slot = JSON.stringify([row.lesson_id, row.client_attempt_id]);
    if (checkSlots.has(slot)) throw new BackupError("Duplicate check attempt", 422);
    checkSlots.add(slot);
    const parsed: unknown = JSON.parse(lesson.lesson_json);
    const questions = (parsed as { questions: unknown[] }).questions;
    const answers = JSON.parse(row.answers_json) as unknown[];
    if (answers.length !== questions.length || row.total !== questions.length) {
      throw new BackupError("Check answers/total do not match lesson", 422);
    }
    const score = questions.reduce<number>((count, question, index) =>
      count + ((question as { correctOption: string }).correctOption === answers[index] ? 1 : 0), 0);
    if (row.score !== score) throw new BackupError("Check score does not match lesson", 422);
  }
  return data;
}

/** Read-only count snapshot for confirmation UI. */
export function getBackupCounts(): BackupCounts {
  return transaction("DEFERRED", () => { readVersion(); return readCounts(); });
}

/** One synchronous SQLite read transaction, including WAL pages; never return a partial file. */
export function exportBackup(): Uint8Array {
  return transaction("DEFERRED", () => {
    readVersion();
    const tables = {} as BackupData["tables"];
    for (const table of TABLE_NAMES) Object.assign(tables, { [table]: [] });
    let rowBytes = 0; // Lower bound; the final envelope is checked at its exact UTF-8 size.
    scanTables((table, row) => {
      // Bound memory before keeping the row; reject rather than truncate.
      rowBytes += Buffer.byteLength(JSON.stringify(row), "utf8");
      assertSize(rowBytes);
      (tables[table] as unknown[]).push(row);
    });
    const data: BackupData = {
      format: FORMAT, formatVersion: FORMAT_VERSION, schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(), tables,
      counts: readCounts(),
    };
    // SQLite can hold values outside the portable JSON types: fail rather than emit an unrestorable file.
    validate(data);
    const serialized = JSON.stringify(data);
    assertSize(Buffer.byteLength(serialized, "utf8"));
    return encoder.encode(serialized);
  });
}

/** Strict UTF-8 and JSON only; never interpret imported bytes as SQL. */
export function parseBackup(bytes: Uint8Array): BackupData {
  if (!(bytes instanceof Uint8Array)) throw new BackupError("Invalid backup bytes", 400);
  assertSize(bytes.byteLength);
  let input: unknown;
  try {
    input = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new BackupError("Invalid backup JSON or UTF-8", 400);
  }
  return validate(input);
}

function verifyDatabase(expected: BackupCounts): void {
  if (!countsMatch(readCounts(), expected)) {
    throw new BackupError("Restored row counts do not match", 422);
  }
  if (getDb().prepare("PRAGMA foreign_key_check").get()) {
    throw new BackupError("Restored foreign keys are invalid", 422);
  }
  const integrity = getDb().prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new BackupError("Database integrity check failed", 422);
  }
}

/** The database state a restore was previewed against. */
export type BackupRevision = { counts: BackupCounts; fingerprint: string };

/**
 * Replace all eight application tables atomically, preserving IDs and future
 * AUTOINCREMENT values. When `expected` is supplied, the current revision is
 * re-checked inside the transaction and a mismatch aborts without touching data.
 */
export function restoreBackup(input: BackupData, expected?: BackupRevision): void {
  let data: BackupData;
  try {
    // Revalidate at commit: callers can mutate the object returned by parseBackup.
    // Upload size is checked against the original bytes in parseBackup. A valid
    // v1-v3 files can grow past 50 MiB in memory when legacy fields gain
    // v4 defaults; that projection must not make commit fail after
    // validate-restore accepted the exact same uploaded bytes.
    const json = JSON.stringify(input);
    data = validate(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("Invalid backup data", 422);
  }
  transaction("IMMEDIATE", () => {
    readVersion();
    const db = getDb();
    // BEGIN IMMEDIATE already holds SQLite's write lock on this file, so this
    // check and the replacement below cannot be interleaved by another writer.
    if (expected && (fingerprintNow() !== expected.fingerprint || !countsMatch(readCounts(), expected.counts))) {
      throw new BackupError("Database changed since validation", 409);
    }
    for (const table of childrenFirst) db.exec(`DELETE FROM ${table}`);
    for (const table of TABLE_NAMES) {
      const names = columns[table];
      const statement = db.prepare(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`);
      for (const row of data.tables[table]) {
        // sessions -> lessons -> sessions is cyclic: insert sessions without their
        // optional origin, then set it after the referenced lesson has been inserted.
        statement.run(...names.map((name) => table === "sessions" && name === "origin_lesson_id"
          ? null : (row as Record<string, string | number | null>)[name]));
      }
    }
    const setOrigin = db.prepare("UPDATE sessions SET origin_lesson_id = ? WHERE id = ?");
    for (const row of data.tables.sessions) {
      if (row.origin_lesson_id !== null) setOrigin.run(row.origin_lesson_id, row.id);
    }
    // DELETE does not reset sqlite_sequence. Rebuild from the restored IDs, including empty tables.
    for (const table of autoincrementTables) {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
      const max = (db.prepare(`SELECT MAX(id) AS id FROM ${table}`).get() as { id: number | null }).id;
      if (max !== null) db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)").run(table, max);
    }
    verifyDatabase(data.counts);
  });
}

/** Session-only wipe cascades children; all-data wipe also clears model preferences. */
export function wipeBackupData(kind: "wipe-sessions" | "wipe-all"): void {
  if (kind !== "wipe-sessions" && kind !== "wipe-all") throw new BackupError("Unknown wipe action", 400);
  transaction("IMMEDIATE", () => {
    readVersion();
    getDb().exec("DELETE FROM sessions");
    if (kind === "wipe-all") getDb().exec("DELETE FROM model_configs");
    for (const table of autoincrementTables) {
      getDb().prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
    }
    const expected = readCounts();
    const shouldBeEmpty = TABLE_NAMES.filter((table) => kind === "wipe-all" || table !== "model_configs");
    if (shouldBeEmpty.some((table) => expected[table] !== 0)) {
      throw new BackupError("Wipe did not remove all requested data", 422);
    }
    verifyDatabase(expected);
  });
}
