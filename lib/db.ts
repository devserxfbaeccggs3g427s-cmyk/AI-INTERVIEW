/**
 * lib/db.ts — single shared SQLite connection (node:sqlite, built-in Node 22+).
 *
 * Hard rules:
 *   - Runtime MUST be `nodejs`. Edge runtime is rejected by NFR-5 / NFR-12.
 *   - WAL journal mode is enabled for concurrent reads during streaming writes.
 *   - Foreign-key enforcement is on. Cascade deletes keep messages / cv / eval in sync.
 *   - API keys (BYOK) NEVER touch these tables. (NFR-2 / NFR-10)
 *
 * The connection is a process-level singleton. node:sqlite is synchronous and
 * safe to share across Next.js route handlers because each JS turn is single-
 * threaded; SQLite's own locking makes concurrent writers serialize.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), process.env.INTERVIEW_DB_PATH ?? "data/interview_sessions.db");

let _db: DatabaseSync | null = null;

function open(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // Pragmas: WAL = better concurrent reads, foreign_keys = cascade deletes work.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) {
    db.close();
    throw new Error(`Unsupported database version: ${version}`);
  }
  // Run both the base DDL and every pending upgrade in one transaction. A failed
  // ALTER leaves user_version and all existing rows/reports unchanged. Version 0
  // includes fresh files and the original pre-v1 schema; the base DDL is idempotent.
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(SCHEMA);
    // Re-read the version under the write lock. Another process may have migrated
    // this file while we waited for it, and re-running an ALTER would abort the boot.
    const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (current !== 0 && current !== 1 && current !== 2 && current !== 3 && current !== 4 && current !== 5) {
      throw new Error(`Unsupported database version: ${current}`);
    }
    if (current === 0) {
      db.exec("ALTER TABLE sessions ADD COLUMN evaluation_started_at INTEGER");
      db.exec("ALTER TABLE sessions ADD COLUMN evaluation_attempt_id TEXT");
      db.exec("PRAGMA user_version = 1");
    }
    if (current < 2) {
      db.exec("ALTER TABLE sessions ADD COLUMN focus_json TEXT NOT NULL DEFAULT '[]'");
      db.exec("PRAGMA user_version = 2");
    }
    db.exec(LEARNING_SCHEMA);
    if (current < 3) db.exec("PRAGMA user_version = 3");
    if (current < 4) {
      db.exec("ALTER TABLE sessions ADD COLUMN origin_lesson_id TEXT REFERENCES learning_lessons(id) ON DELETE SET NULL");
      db.exec("PRAGMA user_version = 4");
    }
    if (current < 5) {
      // A fresh file already has the column from the DDL above, so the ALTER
      // only runs on a database that was created before the column existed.
      const columns = db.prepare("PRAGMA table_info(learning_lessons)").all() as { name: string }[];
      if (!columns.some((column) => column.name === "failure_reason")) {
        db.exec("ALTER TABLE learning_lessons ADD COLUMN failure_reason TEXT");
      }
      db.exec("PRAGMA user_version = 5");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_origin_lesson ON sessions(origin_lesson_id, created_at DESC, id DESC)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  // Before deploying a schema upgrade, stop the app and take an offline SQLite-aware backup
  // including WAL frames. Roll back the app only by restoring the pre-upgrade
  // database on a COPY of the volume, never by down-migrating a live database.
  return db;
}

export function getDb(): DatabaseSync {
  if (!_db) _db = open();
  return _db;
}

/**
 * Full DDL. Idempotent — safe to run on every boot.
 *
 * FR-18 — Server-side single-file SQLite. Tables:
 *   sessions       — one row per interview (id, role, language, mode, length, status, created_at, ended_at, model_config_snapshot)
 *   message_turns  — ordered Q/A pairs WITH raw provider blocks (raw_blocks_json)
 *   cv_extracts    — extracted text + sanitised source from upload
 *   evaluations    — final 4-pillar report (JSON blob validated by Zod, FR-17)
 *   model_configs  — last-used provider/model/parameters per provider (NEVER api_key)
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('vi','en')),
  mode TEXT NOT NULL CHECK (mode IN ('strict','coaching')),
  planned_rounds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','evaluating','completed','failed')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  temperature REAL NOT NULL DEFAULT 0.4,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  top_p REAL NOT NULL DEFAULT 0.95,
  cv_source TEXT CHECK (cv_source IN ('none','paste','pdf')),
  cv_filename TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER,
  -- Plaintext extras stored verbatim for round-by-round coaching micro-rubric.
  -- (Conversation transcripts live in message_turns; this is just for terminal report hydration.)
  rubric_json TEXT,
  error_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_status    ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_provider  ON sessions(provider);

CREATE TABLE IF NOT EXISTS message_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,            -- 1..N (the question number, not the row id)
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','error')),
  content TEXT NOT NULL,                   -- plain text content for re-hydration
  -- Raw provider blocks (provider-specific envelopes, timing, finish_reason, etc.).
  -- FR-18 keeps these so debugging / inspection always works.
  raw_blocks_json TEXT,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  -- Optional micro-rubric feedback for coaching mode (assistant-generated short bullet).
  micro_rubric TEXT,
  finish_reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, turn_number, role)
);

CREATE INDEX IF NOT EXISTS idx_messages_session   ON message_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_messages_created   ON message_turns(created_at DESC);

CREATE TABLE IF NOT EXISTS cv_extracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('paste','pdf')),
  filename TEXT,
  -- Extracted plaintext, sanitised to 20k chars max (FR-3).
  -- Stored verbatim as a draft; raw PDF bytes are intentionally NOT persisted (PII minimization).
  text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cv_session ON cv_extracts(session_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  -- FR-17: Structured schema validated by Zod. Always JSON.
  report_json TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  -- FR-17 sanity flag — was the schema valid on first parse, or did we auto-repair?
  schema_valid INTEGER NOT NULL DEFAULT 1,
  repair_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_evaluations_score  ON evaluations(overall_score DESC);

-- Every final-evaluation attempt, successful or not. \`evaluations\` holds one
-- row per session (the latest good report); this is the audit trail that makes
-- "why did scoring fail?" answerable after the model's raw body has left memory.
-- Both budget attempts of a single claim share attempt_id. No schema_version
-- bump needed — CREATE TABLE IF NOT EXISTS runs on every boot.
CREATE TABLE IF NOT EXISTS evaluation_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed','failed')),
  -- Which output-token budget this round-trip was given.
  max_tokens INTEGER,
  -- 'length' / 'max_tokens' / 'MAX_TOKENS' means the JSON was cut off.
  finish_reason TEXT,
  response_chars INTEGER,
  -- The model's untruncated output, so a parse failure can be diagnosed rather
  -- than guessed at. Model text only — request headers and keys never land here.
  raw_response TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_eval_attempts_session ON evaluation_attempts(session_id, id);

-- Per-provider latest model/parameter prefs (FR-14). NEVER stores api_key.
-- (NFR-2 / NFR-10: keys live in client memory only.)
CREATE TABLE IF NOT EXISTS model_configs (
  provider TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  base_url TEXT,
  temperature REAL NOT NULL,
  max_tokens INTEGER NOT NULL,
  top_p REAL NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/** v3 DDL is run after legacy v0/v1/v2 ALTERs within the same transaction. */
const LEARNING_SCHEMA = `
CREATE TABLE IF NOT EXISTS learning_lessons (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  report_revision TEXT NOT NULL CHECK (length(report_revision) = 64 AND report_revision NOT GLOB '*[^0-9a-f]*'),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('improvement','next_step')),
  source_index INTEGER NOT NULL CHECK (source_index >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('fundamentals','answering')),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 120),
  source_context TEXT CHECK (source_context IS NULL OR length(source_context) <= 500),
  status TEXT NOT NULL CHECK (status IN ('generating','ready','failed')),
  claim_id TEXT,
  claimed_at INTEGER,
  lesson_json TEXT,
  -- Why a lesson could not be stored: a code only, never model text or a provider message.
  failure_reason TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, report_revision, source_kind, source_index, mode),
  CHECK (
    (status = 'generating' AND claim_id IS NOT NULL AND claimed_at IS NOT NULL AND lesson_json IS NULL) OR
    (status = 'ready' AND claim_id IS NULL AND claimed_at IS NULL AND lesson_json IS NOT NULL) OR
    (status = 'failed' AND claim_id IS NULL AND claimed_at IS NULL AND lesson_json IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_learning_lessons_session ON learning_lessons(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_check_attempts (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  client_attempt_id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  total INTEGER NOT NULL CHECK (total BETWEEN 2 AND 3 AND score <= total),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(lesson_id, client_attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_checks_lesson ON learning_check_attempts(lesson_id, created_at);
`;

/** Convenience helper: every write goes through here so we can centralise error UX. */
export function exec(sql: string, params: unknown[] = []): void {
  getDb().prepare(sql).run(...(params as never[]));
}

/** Convenience helper: every read goes through here for type consistency. */
export function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T | undefined {
  const rows = query<T>(sql, params);
  return rows[0];
}

export type TransactionMode = "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE";

/**
 * Run the body in a single SQLite transaction. `mode` is one of
 * "DEFERRED" / "IMMEDIATE" / "EXCLUSIVE". The body runs synchronously — node:sqlite
 * is sync, but next ticks can sneak in if the body awaits. For atomic writes that
 * don't await, "IMMEDIATE" prevents two writers interleaving. On any throw, the
 * transaction is rolled back and the error re-raised. ROLLBACK itself may throw
 * (e.g. if the connection is already broken); swallow that secondary error so the
 * original cause reaches the caller.
 */
export function runInTransaction(mode: TransactionMode, body: () => void): void {
  const db = getDb();
  db.exec(`BEGIN ${mode}`);
  try {
    body();
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Swallow secondary failure; original error is what the caller handles.
    }
    throw err;
  }
  db.exec("COMMIT");
}
