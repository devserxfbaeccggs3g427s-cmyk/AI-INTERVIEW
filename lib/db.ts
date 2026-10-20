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
  db.exec(SCHEMA);
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version.user_version === 0) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN evaluation_started_at INTEGER");
      db.exec("ALTER TABLE sessions ADD COLUMN evaluation_attempt_id TEXT");
      db.exec("PRAGMA user_version = 1");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else if (version.user_version !== 1) {
    throw new Error(`Unsupported database version: ${version.user_version}`);
  }
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
