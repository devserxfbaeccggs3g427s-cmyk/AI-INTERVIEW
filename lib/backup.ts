import { createHash } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { z } from "zod";
import { getDb } from "./db";

/** Only the six application tables are portable; SQLite internals and secrets are not. */
export const TABLE_NAMES = [
  "sessions", "message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "model_configs",
] as const;
type TableName = (typeof TABLE_NAMES)[number];
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
const FORMAT = "interview-ai-backup";
const VERSION = 1;

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

// All columns are explicit, including the two sessions columns added by the v1 migration.
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
    evaluation_attempt_id: nullableText,
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
} as const;

const countsSchema = z.object({
  sessions: integer.nonnegative(), message_turns: integer.nonnegative(),
  cv_extracts: integer.nonnegative(), evaluations: integer.nonnegative(),
  evaluation_attempts: integer.nonnegative(), model_configs: integer.nonnegative(),
}).strict();
export type BackupCounts = z.infer<typeof countsSchema>;

const backupSchema = z.object({
  format: z.literal(FORMAT), formatVersion: z.literal(VERSION),
  schemaVersion: z.literal(VERSION), createdAt: z.string().datetime(),
  tables: z.object({
    sessions: z.array(rowSchemas.sessions),
    message_turns: z.array(rowSchemas.message_turns),
    cv_extracts: z.array(rowSchemas.cv_extracts),
    evaluations: z.array(rowSchemas.evaluations),
    evaluation_attempts: z.array(rowSchemas.evaluation_attempts),
    model_configs: z.array(rowSchemas.model_configs),
  }).strict(), counts: countsSchema,
}).strict();
export type BackupData = z.infer<typeof backupSchema>;

const columns: { [K in TableName]: readonly (keyof BackupData["tables"][K][number] & string)[] } = {
  sessions: ["id", "role", "language", "mode", "planned_rounds", "status", "provider", "model", "base_url", "temperature", "max_tokens", "top_p", "cv_source", "cv_filename", "created_at", "ended_at", "rubric_json", "error_count", "evaluation_started_at", "evaluation_attempt_id"],
  message_turns: ["id", "session_id", "turn_number", "role", "content", "raw_blocks_json", "latency_ms", "prompt_tokens", "completion_tokens", "micro_rubric", "finish_reason", "created_at"],
  cv_extracts: ["id", "session_id", "source", "filename", "text", "char_count", "created_at"],
  evaluations: ["id", "session_id", "report_json", "overall_score", "recommendation", "schema_valid", "repair_attempts", "created_at"],
  evaluation_attempts: ["id", "session_id", "attempt_id", "outcome", "max_tokens", "finish_reason", "response_chars", "raw_response", "error_message", "duration_ms", "created_at"],
  model_configs: ["provider", "model", "base_url", "temperature", "max_tokens", "top_p", "updated_at"],
};
const childrenFirst = ["message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "sessions", "model_configs"] as const;
const autoincrementTables = ["message_turns", "cv_extracts", "evaluations", "evaluation_attempts"] as const;
/** Rows per round trip while scanning. Peak memory is the kept rows plus one batch. */
const BATCH = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function readVersion(): void {
  const version = (getDb().prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version !== VERSION) throw new BackupError("Unsupported database schema version", 409);
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
 * Walk all six tables once, in a stable order, handing each row to `onRow`.
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
 * Content revision of the six tables. Row counts alone cannot distinguish a
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
  if (header.formatVersion !== VERSION || header.schemaVersion !== VERSION) {
    throw new BackupError("Unsupported backup version", 422);
  }
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) throw new BackupError("Invalid backup schema", 422);
  const data = parsed.data;
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
      format: FORMAT, formatVersion: VERSION, schemaVersion: VERSION,
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
 * Replace all six application tables atomically, preserving IDs and future
 * AUTOINCREMENT values. When `expected` is supplied, the current revision is
 * re-checked inside the transaction and a mismatch aborts without touching data.
 */
export function restoreBackup(input: BackupData, expected?: BackupRevision): void {
  let data: BackupData;
  try {
    // Revalidate at commit: callers can mutate the object returned by parseBackup.
    const json = JSON.stringify(input);
    assertSize(Buffer.byteLength(json, "utf8"));
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
        statement.run(...names.map((name) => (row as Record<string, string | number | null>)[name]));
      }
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
