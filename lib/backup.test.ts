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
      rubric_json, evaluation_started_at, evaluation_attempt_id, status, focus_json)
      VALUES (?, ?, 'vi', 'coaching', 2, 'custom', 'model', ?, 123, 'attempt;1', 'completed', ?)`)
    .run("sess_α", "Role 'quoted' ;\n新", "{\"micro\":\"line\\n;\"}", '["Practice ;\\n Unicode 新"]');
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

const lessonJson = JSON.stringify({
  version: 1, title: "SQL joins", goal: "Explain joins", objectives: ["Identify join types"],
  explanation: "Join tables by keys", example: "A joins B", sections: [{ heading: "Inner", body: "Matching keys" }],
  questions: [
    { stem: "First?", options: [{ id: "A", text: "Yes" }, { id: "B", text: "No" }, { id: "C", text: "Maybe" }], correctOption: "A", explanation: "Because" },
    { stem: "Second?", options: [{ id: "A", text: "Yes" }, { id: "B", text: "No" }, { id: "C", text: "Maybe" }], correctOption: "B", explanation: "Because" },
  ],
});
function seedLearning(): void {
  db.prepare(`INSERT INTO learning_lessons (id, session_id, report_revision, source_kind, source_index, mode,
    source_label, source_context, status, lesson_json, provider, model)
    VALUES ('lesson-a', 'sess_α', ?, 'improvement', 0, 'fundamentals', 'SQL joins', 'context', 'ready', ?, 'custom', 'model')`)
    .run("a".repeat(64), lessonJson);
  db.prepare(`INSERT INTO learning_check_attempts (id, lesson_id, client_attempt_id, answers_json, score, total)
    VALUES ('check-a', 'lesson-a', 'a649523b-1c14-41ba-b2d0-f7cf0a3d77d0', '["A","C"]', 1, 2)`).run();
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

test("empty backup has all eight tables, exact counts, and supported version", () => {
  const data = snapshot();
  assert.equal(data.formatVersion, 1);
  assert.equal(data.schemaVersion, 3);
  assert.deepEqual(Object.keys(data.tables), [...backup.TABLE_NAMES]);
  assert.deepEqual(data.counts, backup.getBackupCounts());
  assert.ok(Object.values(data.counts).every((n) => n === 0));
});

test("WAL snapshot round-trips eight tables and migrated columns, including NULL and Unicode", () => {
  seed();
  assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
  const original = snapshot();
  assert.deepEqual(Object.values(original.counts), [1, 1, 1, 1, 1, 1, 0, 0]);
  assert.equal(original.tables.sessions[0].evaluation_started_at, 123);
  assert.equal(original.tables.sessions[0].focus_json, '["Practice ;\\n Unicode 新"]');
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
  expectRejected(modified(data, (d) => { d.schemaVersion = 4 as 3; }), /version/);
  expectRejected(modified(data, (d) => { d.schemaVersion = 1 as 3; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.sessions[0].focus_json = '["", "invalid"]'; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.sessions[0].focus_json = '["a","b","c","d"]'; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.sessions[0].focus_json = JSON.stringify(["x".repeat(121)]); }), /schema/);
  expectRejected(modified(data, (d) => { (d.tables as object as Record<string, unknown>).unknown = []; }), /schema/);
  expectRejected(modified(data, (d) => { delete (d.tables as object as Record<string, unknown>).evaluation_attempts; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.message_turns[0].id = Number.MAX_SAFE_INTEGER + 1; }), /schema/);
  expectRejected(modified(data, (d) => { d.tables.sessions[0].temperature = Infinity; }), /schema/);
  assert.throws(() => backup.parseBackup(Buffer.from("CREATE TABLE x (id int);")), /JSON/);
  assert.throws(() => backup.parseBackup(Buffer.from("{\"format\": \"broken\"")), /JSON/);
  assert.throws(() => backup.parseBackup(Uint8Array.of(0xff, 0xfe)), /UTF-8/);
  assert.throws(() => backup.parseBackup(new Uint8Array(backup.BACKUP_MAX_BYTES + 1)), (e: unknown) => e instanceof backup.BackupError && e.status === 413);
});

test("strict v1 backup restores with empty focus, preserving reports and attempts", () => {
  seed();
  const v2 = snapshot();
  const old = structuredClone(v2) as unknown as Record<string, unknown>;
  old.schemaVersion = 1;
  const tables = old.tables as { sessions: Record<string, unknown>[] };
  delete (old.tables as Record<string, unknown>).learning_lessons;
  delete (old.tables as Record<string, unknown>).learning_check_attempts;
  delete (old.counts as Record<string, unknown>).learning_lessons;
  delete (old.counts as Record<string, unknown>).learning_check_attempts;
  for (const row of tables.sessions) delete row.focus_json;
  const bytes = Buffer.from(JSON.stringify(old));
  const upgraded = backup.parseBackup(bytes);
  assert.equal(upgraded.schemaVersion, 3);
  assert.equal(upgraded.tables.sessions[0].focus_json, "[]");
  assert.deepEqual(upgraded.tables.learning_lessons, []);
  assert.deepEqual(upgraded.tables.learning_check_attempts, []);
  backup.restoreBackup(upgraded);
  assert.equal(snapshot().tables.sessions[0].focus_json, "[]");
  assert.deepEqual(snapshot().tables.evaluations, v2.tables.evaluations);
  assert.deepEqual(snapshot().tables.evaluation_attempts, v2.tables.evaluation_attempts);
  // Direct callers can also supply a parsed legacy envelope; commit revalidates.
  backup.restoreBackup(old as unknown as BackupData);
  assert.equal(snapshot().tables.sessions[0].focus_json, "[]");
  tables.sessions[0].focus_json = "[]";
  assert.throws(() => backup.parseBackup(Buffer.from(JSON.stringify(old))), /schema/);
});

test("strict v2 backup imports six tables and projects two empty learning tables", () => {
  seed();
  seedLearning();
  const old = structuredClone(snapshot()) as unknown as Record<string, unknown>;
  old.schemaVersion = 2;
  for (const name of ["learning_lessons", "learning_check_attempts"]) {
    delete (old.tables as Record<string, unknown>)[name];
    delete (old.counts as Record<string, unknown>)[name];
  }
  const projected = backup.parseBackup(Buffer.from(JSON.stringify(old)));
  assert.deepEqual(projected.counts, { ...old.counts as object, learning_lessons: 0, learning_check_attempts: 0 });
  backup.restoreBackup(projected);
  assert.equal(backup.getBackupCounts().learning_lessons, 0);
  assert.equal(backup.getBackupCounts().learning_check_attempts, 0);
  assert.equal(backup.getBackupCounts().evaluations, 1);
  for (const name of ["learning_lessons", "learning_check_attempts"]) {
    (old.tables as Record<string, unknown>)[name] = [];
    assert.throws(() => backup.parseBackup(Buffer.from(JSON.stringify(old))), /schema/);
    delete (old.tables as Record<string, unknown>)[name];
    (old.counts as Record<string, unknown>)[name] = 0;
    assert.throws(() => backup.parseBackup(Buffer.from(JSON.stringify(old))), /schema/);
    delete (old.counts as Record<string, unknown>)[name];
  }
});

test("v3 learning lessons and checks round-trip, cascade, wipe and fingerprint", () => {
  seed();
  seedLearning();
  const original = snapshot();
  assert.deepEqual(Object.values(original.counts), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(original.tables.learning_lessons[0].lesson_json, lessonJson);
  assert.equal(JSON.stringify(original).includes("api_key"), false);
  const fingerprint = backup.getBackupFingerprint();
  db.prepare("UPDATE learning_check_attempts SET answers_json = '[\"B\",\"C\"]', score = 0 WHERE id = 'check-a'").run();
  assert.notEqual(backup.getBackupFingerprint(), fingerprint);
  backup.restoreBackup(original);
  assert.deepEqual(snapshot().tables, original.tables);
  db.prepare("DELETE FROM sessions WHERE id = 'sess_α'").run();
  assert.equal(backup.getBackupCounts().learning_lessons, 0);
  assert.equal(backup.getBackupCounts().learning_check_attempts, 0);
  backup.restoreBackup(original);
  backup.wipeBackupData("wipe-sessions");
  assert.equal(backup.getBackupCounts().learning_lessons, 0);
  assert.equal(backup.getBackupCounts().learning_check_attempts, 0);
});

test("v3 rejects invalid lesson/check data and leaves existing rows untouched", () => {
  seed();
  seedLearning();
  const original = snapshot();
  const invalid: Array<(data: BackupData) => void> = [
    (d) => { d.tables.learning_lessons[0].lesson_json = "{}"; },
    (d) => { d.tables.learning_lessons[0].report_revision = "bad"; },
    (d) => { d.tables.learning_lessons[0].status = "generating"; },
    (d) => { d.tables.learning_lessons[0].source_label = "x".repeat(121); },
    (d) => { (d.tables.learning_lessons[0] as unknown as Record<string, string>).api_key = "secret"; },
    (d) => { d.tables.learning_lessons.push({ ...d.tables.learning_lessons[0], id: "second" }); d.counts.learning_lessons++; },
    (d) => { d.tables.learning_lessons.push({ ...d.tables.learning_lessons[0] }); d.counts.learning_lessons++; },
    (d) => { d.tables.learning_lessons[0].session_id = "missing"; },
    (d) => { d.tables.learning_check_attempts[0].lesson_id = "missing"; },
    (d) => { d.tables.learning_check_attempts[0].answers_json = '["A"]'; },
    (d) => { d.tables.learning_check_attempts[0].score = 2; },
    (d) => { d.tables.learning_check_attempts.push({ ...d.tables.learning_check_attempts[0], id: "check-b" }); d.counts.learning_check_attempts++; },
    (d) => { d.tables.learning_check_attempts.push({ ...d.tables.learning_check_attempts[0] }); d.counts.learning_check_attempts++; },
  ];
  for (const change of invalid) {
    const data = modified(original, change);
    assert.throws(() => backup.parseBackup(Buffer.from(JSON.stringify(data))));
    assert.throws(() => backup.restoreBackup(data));
    assert.deepEqual(snapshot().tables, original.tables);
  }
});

test("a legal near-limit v1 upload remains restorable after in-memory v2 projection", () => {
  seed();
  const old = structuredClone(snapshot()) as unknown as Record<string, unknown>;
  old.schemaVersion = 1;
  delete (old.tables as Record<string, unknown>).learning_lessons;
  delete (old.tables as Record<string, unknown>).learning_check_attempts;
  delete (old.counts as Record<string, unknown>).learning_lessons;
  delete (old.counts as Record<string, unknown>).learning_check_attempts;
  const session = (old.tables as { sessions: Record<string, unknown>[] }).sessions[0];
  delete session.focus_json;
  const baseBytes = Buffer.byteLength(JSON.stringify(old), "utf8");
  // The uploaded v1 file fits; the projected v2 JSON gains focus_json and exceeds the cap.
  session.role = "x".repeat(backup.BACKUP_MAX_BYTES - baseBytes + String(session.role).length - 1);
  // The fixture's original Unicode role occupies three more UTF-8 bytes than
  // its JavaScript string length, so fill the remaining difference exactly.
  session.role += "x".repeat(backup.BACKUP_MAX_BYTES - 1 - Buffer.byteLength(JSON.stringify(old), "utf8"));
  const bytes = Buffer.from(JSON.stringify(old));
  assert.equal(bytes.byteLength, backup.BACKUP_MAX_BYTES - 1);
  const upgraded = backup.parseBackup(bytes);
  assert.ok(Buffer.byteLength(JSON.stringify(upgraded), "utf8") > backup.BACKUP_MAX_BYTES);
  backup.restoreBackup(upgraded);
  assert.equal((db.prepare("SELECT length(role) AS n FROM sessions WHERE id='sess_α'").get() as {n: number}).n,
    (session.role as string).length);
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
  assert.deepEqual(Object.values(counts), [0, 0, 0, 0, 0, 1, 0, 0]);
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
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1, 0, 0]);
  assert.notEqual(backup.getBackupFingerprint(), seeded);

  // A delete + insert that balances the count is still a change.
  const beforeSwap = backup.getBackupFingerprint();
  db.prepare("DELETE FROM message_turns WHERE turn_number = 1").run();
  db.prepare("INSERT INTO message_turns (session_id, turn_number, role, content) VALUES ('sess_α', 1, 'assistant', 'replacement')").run();
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1, 0, 0]);
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
  assert.deepEqual(Object.values(backup.getBackupCounts()), [1, 1, 1, 1, 1, 1, 0, 0]);

  // A revision matching the current state still restores.
  backup.restoreBackup(original, revision());
  assert.deepEqual(snapshot().tables, original.tables);

  // Stale counts are rejected too, even when the content happens to match.
  const good = revision();
  const wrongCounts = { ...good, counts: { ...good.counts, sessions: 99 } };
  assert.throws(() => backup.restoreBackup(original, wrongCounts), (e: unknown) => e instanceof backup.BackupError && e.status === 409);
  assert.equal(role(), original.tables.sessions[0].role);
});
