import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { FocusSchema, parseStoredFocus } from "./focus";

// Every app import is in a separate process with INTERVIEW_DB_PATH already set.
// Never load the singleton against the real DB, or change its path mid-process.
const dir = mkdtempSync(join(tmpdir(), "focus-migration-"));
const paths = ["legacy.db", "fresh.db", "future.db", "failure.db", "v3.db"].map((name) => join(dir, name));
const invoke = (path: string) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
  "try { const { getDb } = await import('./lib/db.ts'); const db = getDb(); const columns = db.prepare('PRAGMA table_info(sessions)').all(); console.log(JSON.stringify({ version: db.prepare('PRAGMA user_version').get().user_version, focus: columns.find(c => c.name === 'focus_json')?.dflt_value, origin: columns.find(c => c.name === 'origin_lesson_id')?.dflt_value })); db.close(); } catch (error) { console.error(String(error)); process.exitCode = 1; }",
], { cwd: process.cwd(), env: { ...process.env, INTERVIEW_DB_PATH: path }, encoding: "utf8" });

test("focus schema trims and enforces 3 entries of 1–120 characters", () => {
    assert.deepEqual(FocusSchema.parse(["  SQL  ", "Ω"]), ["SQL", "Ω"]);
    assert.equal(FocusSchema.safeParse([" "]).success, false);
    assert.equal(FocusSchema.safeParse(["x".repeat(121)]).success, false);
    assert.equal(FocusSchema.safeParse(["a", "b", "c", "d"]).success, false);
    assert.deepEqual(parseStoredFocus('[" SQL "]'), ["SQL"]);
    for (const raw of [null, "invalid", "{}", '[" "]', '["a","b","c","d"]']) {
      assert.deepEqual(parseStoredFocus(raw), []);
    }
  });

test("v1 migration retains legacy rows/reports and gives sessions default focus", () => {
    assert.equal(invoke(paths[0]).status, 0);
    const legacy = new DatabaseSync(paths[0]);
     legacy.exec(`DROP INDEX idx_sessions_origin_lesson;
     ALTER TABLE sessions DROP COLUMN origin_lesson_id;
     ALTER TABLE sessions DROP COLUMN focus_json;
    INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, evaluation_started_at, evaluation_attempt_id)
      VALUES ('old', 'Engineer', 'en', 'strict', 3, 'custom', 'model', 123, 'attempt');
    INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
      VALUES ('old', '{"legacy":"report"}', 73, 'review');
    PRAGMA user_version = 1;`);
    legacy.close();
    const result = invoke(paths[0]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { version: 5, focus: "'[]'", origin: null });
    const reopened = new DatabaseSync(paths[0]);
    try {
      assert.deepEqual({ ...(reopened.prepare("SELECT role, evaluation_started_at, evaluation_attempt_id, focus_json FROM sessions WHERE id = 'old'").get() as Record<string, unknown>) },
        { role: "Engineer", evaluation_started_at: 123, evaluation_attempt_id: "attempt", focus_json: "[]" });
      assert.deepEqual({ ...(reopened.prepare("SELECT report_json, overall_score FROM evaluations WHERE session_id = 'old'").get() as Record<string, unknown>) },
        { report_json: '{"legacy":"report"}', overall_score: 73 });
      assert.equal((reopened.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
    } finally { reopened.close(); }
    assert.equal(invoke(paths[0]).status, 0, "reopening v5 is idempotent");
  });

  test("fresh DB opens at v5 with default focus and nullable lesson origin", () => {
    const result = invoke(paths[1]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { version: 5, focus: "'[]'", origin: null });
    const db = new DatabaseSync(paths[1]);
    try {
      db.exec("INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model) VALUES ('fresh', 'dev', 'en', 'strict', 1, 'custom', 'm')");
       assert.deepEqual({ ...(db.prepare("SELECT focus_json, origin_lesson_id FROM sessions WHERE id = 'fresh'").get() as Record<string, unknown>) },
         { focus_json: "[]", origin_lesson_id: null });
    } finally { db.close(); }
  });

  test("v3 migration keeps existing sessions and lessons and adds nullable origin FK", () => {
    assert.equal(invoke(paths[4]).status, 0);
    const legacy = new DatabaseSync(paths[4]);
    legacy.exec(`DROP INDEX idx_sessions_origin_lesson;
      ALTER TABLE sessions DROP COLUMN origin_lesson_id;
      INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model)
        VALUES ('old', 'Engineer', 'en', 'strict', 3, 'custom', 'model');
      INSERT INTO learning_lessons (id, session_id, report_revision, source_kind, source_index,
        mode, source_label, status, lesson_json, provider, model)
        VALUES ('lesson-old', 'old', '${"a".repeat(64)}', 'improvement', 0,
          'fundamentals', 'Practice SQL', 'ready', '{}', 'custom', 'model');
      PRAGMA user_version = 3;`);
    legacy.close();
    const result = invoke(paths[4]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { version: 5, focus: "'[]'", origin: null });
    const reopened = new DatabaseSync(paths[4]);
    reopened.exec("PRAGMA foreign_keys = ON");
    try {
      assert.equal((reopened.prepare("SELECT origin_lesson_id FROM sessions WHERE id = 'old'").get() as { origin_lesson_id: string | null }).origin_lesson_id, null);
      assert.equal((reopened.prepare("SELECT id FROM learning_lessons WHERE id = 'lesson-old'").get() as { id: string }).id, "lesson-old");
      reopened.prepare("UPDATE sessions SET origin_lesson_id = 'lesson-old' WHERE id = 'old'").run();
      assert.throws(() => reopened.prepare("UPDATE sessions SET origin_lesson_id = 'missing' WHERE id = 'old'").run(), /FOREIGN KEY/);
      reopened.prepare("DELETE FROM learning_lessons WHERE id = 'lesson-old'").run();
      assert.equal((reopened.prepare("SELECT origin_lesson_id FROM sessions WHERE id = 'old'").get() as { origin_lesson_id: string | null }).origin_lesson_id, null);
      assert.equal(reopened.prepare("PRAGMA foreign_key_check").get(), undefined);
    } finally { reopened.close(); }
    assert.equal(invoke(paths[4]).status, 0, "v5 migration is idempotent");
  });

  test("future version is refused before any schema writes", () => {
    const db = new DatabaseSync(paths[2]);
    db.exec("PRAGMA user_version = 6");
    db.close();
    const result = invoke(paths[2]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported database version: 6/);
    const reopened = new DatabaseSync(paths[2]);
    try {
       assert.equal((reopened.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 6);
      assert.equal(reopened.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").get(), undefined);
    } finally { reopened.close(); }
  });

test("failed v1 migration rolls back schema and data atomically", () => {
    assert.equal(invoke(paths[3]).status, 0);
    const seeded = new DatabaseSync(paths[3]);
    // A pre-existing focus_json makes ALTER fail while v1 remains intact.
    seeded.exec("INSERT INTO sessions(id, role, language, mode, planned_rounds, provider, model) VALUES ('keep', 'dev', 'en', 'strict', 1, 'custom', 'm'); DROP TABLE message_turns; PRAGMA user_version = 1");
    seeded.close();
    const result = invoke(paths[3]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate column name: focus_json/);
    const reopened = new DatabaseSync(paths[3]);
    try {
      assert.equal((reopened.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
      assert.equal((reopened.prepare("SELECT id FROM sessions").get() as { id: string }).id, "keep");
      assert.equal(reopened.prepare("SELECT name FROM sqlite_master WHERE name = 'message_turns'").get(), undefined,
        "base DDL was rolled back together with the failed ALTER");
    } finally { reopened.close(); }
  });
after(() => rmSync(dir, { recursive: true, force: true }));
