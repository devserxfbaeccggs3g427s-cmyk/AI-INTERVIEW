import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { BackupData } from "./backup";

let directory: string;
let dbPath: string;
let appDb: DatabaseSync;
let backup: typeof import("./backup");
const previousPath = process.env.INTERVIEW_DB_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "backup-restart-"));
  dbPath = join(directory, "test.db");
  process.env.INTERVIEW_DB_PATH = dbPath;
  // The singleton resolves the path at module load: dynamic imports below must happen after the env set.
  backup = await import("./backup");
  appDb = (await import("./db")).getDb();
});

after(() => {
  if (appDb) appDb.close();
  if (previousPath === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousPath;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  backup.wipeBackupData("wipe-all");
});

function seed(): void {
  appDb.prepare(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status, focus_json)
      VALUES (?, ?, 'vi', 'coaching', 2, 'custom', 'model', 'completed', ?)`)
    .run("sess_α", "restart-role", '["questions"]');
  appDb.prepare(`INSERT INTO message_turns (session_id, turn_number, role, content)
      VALUES (?, 1, 'assistant', ?)`).run("sess_α", "q1; ' Ω");
  appDb.prepare(`INSERT INTO cv_extracts (session_id, source, text, char_count)
      VALUES (?, 'paste', ?, 7)`).run("sess_α", "cv; '");
  appDb.prepare(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
      VALUES (?, ?, 78, 'hire')`).run("sess_α", '{"score":78}');
  appDb.prepare(`INSERT INTO evaluation_attempts (session_id, attempt_id, outcome, raw_response)
      VALUES (?, 'attempt;1', 'completed', ?)`).run("sess_α", "raw; '");
  appDb.prepare(`INSERT INTO model_configs (provider, model, temperature, max_tokens, top_p)
      VALUES ('custom', 'model', 0.4, 4096, 0.95)`).run();
}

/**
 * Standalone Node child process script. Plain `node:sqlite` against the same file —
 * no app TypeScript modules, no tsx loader hooks. Prints exactly one JSON line and
 * exits non-zero on failure.
 */
const RESTART_SCRIPT = `import { DatabaseSync } from "node:sqlite";

const path = process.env.INTERVIEW_DB_PATH;
const sessionId = process.env.RESTART_SESSION_ID;
try {
  if (!path) throw new Error("INTERVIEW_DB_PATH not set in child");
  if (!sessionId) throw new Error("RESTART_SESSION_ID not set in child");
  const db = new DatabaseSync(path);
  try {
    const version = db.prepare("PRAGMA user_version").get().user_version;
    const session = db.prepare("SELECT role, focus_json FROM sessions WHERE id = ?").get(sessionId);
    const maxRow = db.prepare("SELECT MAX(id) AS id FROM message_turns").get();
    const beforeMaxId = maxRow && maxRow.id !== null ? maxRow.id : 0;
    const beforeCounts = {
      sessions: db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      message_turns: db.prepare("SELECT COUNT(*) AS n FROM message_turns").get().n,
      cv_extracts: db.prepare("SELECT COUNT(*) AS n FROM cv_extracts").get().n,
      evaluations: db.prepare("SELECT COUNT(*) AS n FROM evaluations").get().n,
      evaluation_attempts: db.prepare("SELECT COUNT(*) AS n FROM evaluation_attempts").get().n,
      model_configs: db.prepare("SELECT COUNT(*) AS n FROM model_configs").get().n,
    };
    db.prepare("INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, 2, 'user', 'after-restart')")
      .run(sessionId);
    const newRow = db.prepare("SELECT id FROM message_turns WHERE turn_number = 2").get();
    console.log(JSON.stringify({
      ok: true,
      version,
      sessionRole: session && session.role !== undefined ? session.role : null,
      focusJson: session && session.focus_json !== undefined ? session.focus_json : null,
      sessionFound: !!session,
      beforeMaxId,
      newRowId: newRow.id,
      beforeCounts,
    }));
  } finally {
    db.close();
  }
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err && err.stack ? err.stack : err) }));
  process.exit(1);
}
`;

function runChild(): {
  payload: Record<string, unknown>;
  stderr: string;
  status: number | null;
} {
  const scriptPath = join(directory, "restart-child.mjs");
  writeFileSync(scriptPath, RESTART_SCRIPT);
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, INTERVIEW_DB_PATH: dbPath, RESTART_SESSION_ID: "sess_α" },
      encoding: "utf8",
    });
    const stdout = (result.stdout ?? "").trim();
    const lines = stdout.split("\n").filter((line) => line.startsWith("{"));
    const lastLine = lines[lines.length - 1] ?? "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(lastLine) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`child emitted non-JSON output: stdout=${JSON.stringify(stdout)} stderr=${result.stderr} (parse: ${String(err)})`);
    }
    return { payload, stderr: result.stderr ?? "", status: result.status };
  } finally {
    rmSync(scriptPath, { force: true });
  }
}

test("restore survives a real child-process restart and AUTOINCREMENT continues from restored max", () => {
  seed();
  const snapshot = backup.parseBackup(backup.exportBackup());
  assert.deepEqual(Object.values(snapshot.counts), [1, 1, 1, 1, 1, 1]);

  // Wipe + restore. After this, the data lives only on disk in the SQLite file.
  backup.wipeBackupData("wipe-all");
  assert.ok(Object.values(backup.getBackupCounts()).every((n) => n === 0), "wipe-all leaves every table empty");
  backup.restoreBackup(snapshot);

  // Hand the file to a brand-new Node process. Different process = real restart.
  const { payload, stderr, status } = runChild();
  assert.equal(status, 0, `child must exit zero (stderr=${stderr})`);
  assert.equal(payload.ok, true, `child reported failure: ${JSON.stringify(payload)}`);

  assert.equal(payload.version, 2, "PRAGMA user_version must be 2 after restore");
  assert.equal(payload.focusJson, '["questions"]');
  assert.equal(payload.sessionFound, true, "restored session row must be visible to the child");
  assert.equal(payload.sessionRole, "restart-role", "Unicode/control-character content must round-trip through disk");

  // All six tables must show the restored row counts.
  assert.deepEqual(payload.beforeCounts, snapshot.counts, "child sees the full restored row set");

  // AUTOINCREMENT must continue from the restored max id, not reset to 1.
  assert.equal(payload.beforeMaxId, 1, "the restored message_turns.id is 1");
  assert.equal(payload.newRowId, (payload.beforeMaxId as number) + 1,
    "next AUTOINCREMENT id must equal restored MAX(id) + 1, not 1");
});

test("exportBackup sees another writer's WAL commit and the envelope is internally consistent", () => {
  // Independent DatabaseSync to the same file. The app's singleton is still open in parallel.
  const writer = new DatabaseSync(dbPath);
  try {
    // The file header already declares WAL because the app opened it first.
    const mode = (writer.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode;
    assert.equal(mode, "wal", "DB file must already be in WAL mode from the app connection");

    // Commit a write through the writer. The frame lands in the WAL, not the main DB file.
    writer.prepare(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
        VALUES ('writer_α', ?, 'en', 'strict', 1, 'openai', 'gpt-4', 'completed')`)
      .run("from-writer");

    // Export through the app connection. Its read snapshot must include the writer's WAL frames,
    // even though the writer holds a separate handle from a parallel open.
    const exported: BackupData = backup.parseBackup(backup.exportBackup());

    assert.equal(exported.counts.sessions, 1, "app export must see writer's WAL commit");
    assert.equal(exported.tables.sessions.length, 1);
    assert.equal(exported.tables.sessions[0].id, "writer_α");
    assert.equal(exported.tables.sessions[0].role, "from-writer");
    assert.equal(exported.tables.sessions[0].provider, "openai");

    // Internal consistency: declared counts must match actual row lengths in the envelope.
    for (const table of backup.TABLE_NAMES) {
      assert.equal(
        exported.counts[table],
        exported.tables[table].length,
        `declared count for ${table} (${exported.counts[table]}) does not match rows (${exported.tables[table].length})`,
      );
    }

    // Parent/child reference resolution: every session_id reference in child tables must
    // resolve to a session id present in the same envelope.
    const sessionIds = new Set(exported.tables.sessions.map((s) => s.id));
    for (const turn of exported.tables.message_turns) {
      assert.ok(sessionIds.has(turn.session_id), `orphan message_turn: ${turn.session_id}`);
    }
    for (const cv of exported.tables.cv_extracts) {
      assert.ok(sessionIds.has(cv.session_id), `orphan cv_extract: ${cv.session_id}`);
    }
    for (const evaluation of exported.tables.evaluations) {
      assert.ok(sessionIds.has(evaluation.session_id), `orphan evaluation: ${evaluation.session_id}`);
    }
    for (const attempt of exported.tables.evaluation_attempts) {
      assert.ok(sessionIds.has(attempt.session_id), `orphan evaluation_attempt: ${attempt.session_id}`);
    }
  } finally {
    writer.close();
  }
});
