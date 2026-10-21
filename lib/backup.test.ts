import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { BackupData } from "./backup";

let directory: string;
let dbPath: string;
let db: DatabaseSync;
let backup: typeof import("./backup");
const previousPath = process.env.INTERVIEW_DB_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "backup-test-"));
  dbPath = join(directory, "test.db");
  process.env.INTERVIEW_DB_PATH = dbPath;
  // The singleton resolves the path at module load: this must be a dynamic import.
  backup = await import("./backup");
  db = (await import("./db")).getDb();
});

after(() => {
  if (db) db.close();
  if (previousPath === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousPath;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  backup.wipeBackupData("wipe-all");
});

function seed(): void {
  db.prepare(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model,
      rubric_json, evaluation_started_at, evaluation_attempt_id, status)
      VALUES (?, ?, 'vi', 'coaching', 2, 'custom', 'model', ?, 123, 'attempt;1', 'completed')`)
    .run("sess_α", "Role 'quoted' ;\n新", "{\"micro\":\"line\\n;\"}");
  db.prepare(`INSERT INTO message_turns (session_id, turn_number, role, content, raw_blocks_json)
      VALUES (?, 1, 'assistant', ?, ?)`).run("sess_α", "question\n; ' Ω", '{"blocks":";\\n"}');
  db.prepare(`INSERT INTO cv_extracts (session_id, source, text, char_count) VALUES (?, 'paste', ?, ?)`)
    .run("sess_α", "CV ;\n 日", 7);
  db.prepare(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
      VALUES (?, ?, 78, 'hire')`).run("sess_α", '{"score":78,"comment":";\\n"}');
  db.prepare(`INSERT INTO evaluation_attempts (session_id, attempt_id, outcome, raw_response)
      VALUES (?, 'attempt;1', 'failed', ?)`).run("sess_α", "model raw; \n' שלום");
  db.prepare(`INSERT INTO model_configs (provider, model, temperature, max_tokens, top_p)
      VALUES ('custom', 'model', 0.4, 4096, 0.95)`).run();
}

function snapshot(): BackupData {
  return backup.parseBackup(backup.exportBackup());
}
function modified(data: BackupData, action: (clone: BackupData) => void): BackupData {
  const clone = structuredClone(data);
  action(clone);
  return clone;
}
function expectRejected(data: BackupData, matcher: RegExp): void {
  assert.throws(() => backup.parseBackup(Buffer.from(JSON.stringify(data))), matcher);
}

test("empty backup has all six tables, exact counts, and supported version", () => {
  const data = snapshot();
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(Object.keys(data.tables), [...backup.TABLE_NAMES]);
  assert.deepEqual(data.counts, backup.getBackupCounts());
  assert.ok(Object.values(data.counts).every((n) => n === 0));
});

test("WAL snapshot round-trips six tables and migrated columns, including NULL and Unicode", () => {
  seed();
  assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
  const original = snapshot();
  assert.deepEqual(Object.values(original.counts), [1, 1, 1, 1, 1, 1]);
  assert.equal(original.tables.sessions[0].evaluation_started_at, 123);
  assert.equal(original.tables.sessions[0].base_url, null);
  assert.match(original.tables.message_turns[0].content, /Ω/);
  assert.equal(JSON.stringify(original).includes("api_key"), false);

  // Existing higher sequence must not survive a replace with lower IDs.
  db.prepare("INSERT INTO message_turns (id, session_id, turn_number, role, content) VALUES (900, ?, 2, 'user', 'old')").run("sess_α");
  backup.restoreBackup(original);
  const restored = snapshot();
  assert.deepEqual(restored.tables, original.tables);
  backup.restoreBackup(original);
  assert.deepEqual(snapshot().tables, original.tables);
  db.prepare("INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, 2, 'user', 'next')").run("sess_α");
  assert.equal((db.prepare("SELECT id FROM message_turns WHERE turn_number=2").get() as { id: number }).id, original.tables.message_turns[0].id + 1);
});

test("backup export rejects a UTF-8 payload above 50 MiB without returning truncated data", () => {
  // Multibyte characters make a character-count check incorrectly accept this row.
  db.prepare("INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model) VALUES ('large', ?, 'en', 'strict', 1, 'custom', 'model')")
    .run("界".repeat(Math.ceil(backup.BACKUP_MAX_BYTES / 3)));
  assert.throws(() => backup.exportBackup(), (error: unknown) => error instanceof backup.BackupError && error.status === 413);
});

test("counts, unknown fields, versions, invalid UTF-8, SQL, and oversized files fail", () => {
  seed();
  const data = snapshot();
  expectRejected(modified(data, (d) => { d.counts.sessions++; }), /counts/);
  expectRejected(modified(data, (d) => { (d.tables.sessions[0] as object as Record<string, string>).api_key = "never"; }), /schema/);
  expectRejected(modified(data, (d) => { d.formatVersion = 2 as 1; }), /version/);
  expectRejected(modified(data, (d) => { d.schemaVersion = 2 as 1; }), /version/);
  expectRejected(modified(data, (d) => { (d.tables as object as Record<string, unknown>).unknown = []; }), /schema/);
  expectRejected(modified(data, (d) => { delete (d.tables as object as Record<string, unknown>).evaluation_attempts; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.message_turns[0].id = Number.MAX_SAFE_INTEGER + 1; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.sessions[0].temperature = Infinity; }), /schema/);
  assert.throws(() => backup.parseBackup(Buffer.from("CREATE TABLE x (id int);")), /JSON/);
  assert.throws(() => backup.parseBackup(Buffer.from("{\"format\": \"broken\"")), /JSON/);
  assert.throws(() => backup.parseBackup(Uint8Array.of(0xff, 0xfe)), /UTF-8/);
  assert.throws(() => backup.parseBackup(new Uint8Array(backup.BACKUP_MAX_BYTES + 1)), (e: unknown) => e instanceof backup.BackupError && e.status === 413);
});

test("duplicate IDs, duplicate turns, duplicate evaluation and orphan foreign key fail without mutation", () => {
  seed();
  const original = snapshot();
  const cases: [string, (d: BackupData) => void][] = [
    ["session", (d) => { d.tables.sessions.push(structuredClone(d.tables.sessions[0])); d.counts.sessions++; }],
    ["ID", (d) => { d.tables.message_turns.push(structuredClone(d.tables.message_turns[0])); d.counts.message_turns++; }],
    ["turn", (d) => { d.tables.message_turns.push({ ...d.tables.message_turns[0], id: 2 }); d.counts.message_turns++; }],
    ["evaluation", (d) => { d.tables.evaluations.push({ ...d.tables.evaluations[0], id: 2 }); d.counts.evaluations++; }],
    ["Orphan", (d) => { d.tables.cv_extracts[0].session_id = "missing"; }],
  ];
  for (const [reason, action] of cases) {
    const invalid = modified(original, action);
    expectRejected(invalid, new RegExp(reason, "i"));
    assert.throws(() => backup.restoreBackup(invalid));
    assert.deepEqual(snapshot().tables, original.tables);
  }
});

test("a failed INSERT rolls back deletion and sequence changes", () => {
  seed();
  const original = snapshot();
  const sequenceBefore = db.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name").all();
  db.exec("CREATE TRIGGER backup_test_fail BEFORE INSERT ON message_turns BEGIN SELECT RAISE(ABORT, 'injected write failure'); END");
  try {
    assert.throws(() => backup.restoreBackup(original), /injected write failure/);
    assert.deepEqual(snapshot().tables, original.tables);
    assert.deepEqual(db.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name").all(), sequenceBefore);
  } finally {
    db.exec("DROP TRIGGER backup_test_fail");
  }
});

test("restoring an empty backup resets all sequences and keeps restored higher IDs", () => {
  const empty = snapshot();
  seed();
  backup.restoreBackup(empty);
  assert.deepEqual(db.prepare("SELECT name, seq FROM sqlite_sequence").all(), []);
  seed();
  const high = modified(snapshot(), (d) => { d.tables.cv_extracts[0].id = 412; });
  backup.restoreBackup(high);
  assert.equal((db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'cv_extracts'").get() as { seq: number }).seq, 412);
  db.prepare("INSERT INTO cv_extracts (session_id, source, text, char_count) VALUES ('sess_α', 'paste', '', 0)").run();
  assert.equal((db.prepare("SELECT MAX(id) AS id FROM cv_extracts").get() as { id: number }).id, 413);
});

test("wipe-sessions cascades children but preserves configs; wipe-all clears all and resets sequence", () => {
  seed();
  backup.wipeBackupData("wipe-sessions");
  const counts = backup.getBackupCounts();
  assert.deepEqual(Object.values(counts), [0, 0, 0, 0, 0, 1]);
  backup.wipeBackupData("wipe-all");
  assert.ok(Object.values(backup.getBackupCounts()).every((n) => n === 0));
  assert.throws(() => backup.wipeBackupData("unsupported" as "wipe-all"), /wipe/);
});

function revision() {
  return { counts: backup.getBackupCounts(), fingerprint: backup.getBackupFingerprint() };
}
function role(): string | undefined {
  return (db.prepare("SELECT role FROM sessions WHERE id = 'sess_α'").get() as { role: string } | undefined)?.role;
}

test("fingerprint tracks row content, not just row counts", () => {
  const empty = backup.getBackupFingerprint();
  assert.equal(empty, backup.getBackupFingerprint(), "stable when nothing changes");
  seed();
  const seeded = backup.getBackupFingerprint();
  assert.notEqual(empty, seeded);

  // Same row count, different content: a counts-only check would miss this.
  db.prepare("UPDATE sessions SET role = 'Role rewritten' WHERE id = 'sess_α'").run();
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1]);
  assert.notEqual(backup.getBackupFingerprint(), seeded);

  // A delete + insert that balances the count is still a change.
  const beforeSwap = backup.getBackupFingerprint();
  db.prepare("DELETE FROM message_turns WHERE turn_number = 1").run();
  db.prepare("INSERT INTO message_turns (session_id, turn_number, role, content) VALUES ('sess_α', 1, 'assistant', 'replacement')").run();
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1]);
  assert.notEqual(backup.getBackupFingerprint(), beforeSwap);
});

test("restoreBackup aborts on a stale revision and leaves the newer rows in place", () => {
  seed();
  const original = snapshot();
  const stale = revision();
  db.prepare("UPDATE sessions SET role = 'newer' WHERE id = 'sess_α'").run();

  assert.throws(
    () => backup.restoreBackup(original, stale),
    (error: unknown) => error instanceof backup.BackupError && error.status === 409,
  );
  assert.equal(role(), "newer", "a rejected restore must not delete or overwrite anything");
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1]);

  // A revision matching the current state still restores.
  backup.restoreBackup(original, revision());
  assert.deepEqual(snapshot().tables, original.tables);

  // Stale counts are rejected too, even when the content happens to match.
  const good = revision();
  const wrongCounts = { ...good, counts: { ...good.counts, sessions: 99 } };
  assert.throws(() => backup.restoreBackup(original, wrongCounts), (e: unknown) => e instanceof backup.BackupError && e.status === 409);
  assert.equal(role(), original.tables.sessions[0].role);
});
