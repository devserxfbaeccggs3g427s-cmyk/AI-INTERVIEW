import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";

let directory: string;
let db: DatabaseSync;
let loadLearningSource: typeof import("./learning-source").loadLearningSource;
const previousPath = process.env.INTERVIEW_DB_PATH;
const longImprovement = "Ưu tiên diễn giải retry ".repeat(15).slice(0, 350);
const longDescription = "Nhắc lại trade-off và ngữ cảnh quan sát. ".repeat(14).slice(0, 500);
const item = { title: "Retry", description: longDescription, duration: "15 phút" };

function report() {
  const pillar = { score: 50, headline: "Ổn", rationale: "Trả lời rõ." };
  return {
    schema_version: "v1", generated_at: "2026-10-22T00:00:00.000Z", overall_score: 50,
    recommendation: "Hire", pillars: { content: pillar, relevance: pillar, clarity: pillar, depth: pillar },
    strengths: ["Điểm mạnh"],
    improvements: [longImprovement, longImprovement],
    per_turn: [{ turn_number: 1, topic: "Retry", pillar_scores: { content: 50, relevance: 50, clarity: 50, depth: 50 }, micro_rubric: { strengths: [], improvements: [] } }],
    next_steps: [item, item, item],
  };
}

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "learning-source-test-"));
  process.env.INTERVIEW_DB_PATH = join(directory, "test.db");
  // db.ts resolves its path on import; never load it before the isolated env is set.
  const database = await import("./db");
  db = database.getDb();
  loadLearningSource = (await import("./learning-source")).loadLearningSource;
  db.prepare(`INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model)
    VALUES ('ready', 'Backend', 'vi', 'strict', 5, 'completed', 'custom', 'model')`).run();
  db.prepare(`INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model)
    VALUES ('active', 'Backend', 'en', 'strict', 5, 'active', 'custom', 'model')`).run();
});

after(() => {
  if (db) db.close();
  if (previousPath === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousPath;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function save(id: string, json: string) {
  db.prepare(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
    VALUES (?, ?, 50, 'Hire') ON CONFLICT(session_id) DO UPDATE SET report_json=excluded.report_json`).run(id, json);
}

test("completed session resolves duplicate prose by kind and index, without CV or transcript", () => {
  const raw = JSON.stringify(report());
  save("ready", raw);
  const first = loadLearningSource("ready", "improvement", 0);
  const second = loadLearningSource("ready", "improvement", 1);
  const next = loadLearningSource("ready", "next_step", 0);
  assert.ok(first && second && next);
  const hash = createHash("sha256").update(raw).digest("hex");
  assert.equal(first.reportRevision, hash);
  assert.equal(second.reportRevision, hash);
  assert.equal(next.reportRevision, hash);
  assert.equal(first.source, second.source);
  assert.notEqual(first.index, second.index);
  assert.notEqual(first.kind, next.kind);
  assert.equal(first.role, "Backend");
  assert.equal(first.language, "vi");
  assert.equal(first.source, longImprovement);
  assert.equal(first.label, longImprovement.slice(0, 120));
  assert.equal(first.context, "");
  assert.deepEqual(next.source, item);
  assert.equal(next.label, "Retry");
  assert.equal(next.context, `${item.description.slice(0, 500 - item.duration.length - 1)}\n${item.duration}`);
  assert.equal(next.context.length, 500);
  assert.ok(next.context.endsWith("15 phút"));
  assert.equal(JSON.stringify(next).includes("per_turn"), false);
});

test("revision hashes exact stored bytes, not parsed object, and source follows replacement", () => {
  const raw = JSON.stringify(report());
  const spaced = JSON.stringify(report(), null, 2);
  assert.notEqual(raw, spaced);
  save("ready", raw);
  const original = loadLearningSource("ready", "next_step", 0)!;
  save("ready", spaced);
  const changed = loadLearningSource("ready", "next_step", 0)!;
  assert.deepEqual(original.source, changed.source);
  assert.notEqual(original.reportRevision, changed.reportRevision);
  assert.equal(changed.reportRevision, createHash("sha256").update(spaced).digest("hex"));
});

test("invalid report/status/missing item never invents a source", () => {
  save("active", JSON.stringify(report()));
  assert.equal(loadLearningSource("active", "improvement", 0), null);
  assert.equal(loadLearningSource("missing", "improvement", 0), null);
  assert.equal(loadLearningSource("ready", "improvement", -1), null);
  assert.equal(loadLearningSource("ready", "improvement", 2), null);
  assert.equal(loadLearningSource("ready", "next_step", 3), null);
  assert.equal(loadLearningSource("ready", "improvement", 1.4), null);
  assert.equal(loadLearningSource("ready", "improvement", Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(loadLearningSource("ready", "strength" as "improvement", 0), null);
  save("ready", "{not valid JSON");
  assert.equal(loadLearningSource("ready", "improvement", 0), null);
  save("ready", JSON.stringify({ ...report(), improvements: [] }));
  assert.equal(loadLearningSource("ready", "improvement", 0), null);
});
