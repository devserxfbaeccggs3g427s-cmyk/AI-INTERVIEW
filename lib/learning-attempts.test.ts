import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const origin = "https://interview.example.com";
const oldDbPath = process.env.INTERVIEW_DB_PATH;
const oldOrigin = process.env.PUBLIC_ORIGIN;
const temp = mkdtempSync(join(tmpdir(), "learning-attempts-"));
process.env.INTERVIEW_DB_PATH = join(temp, "checks.db");
process.env.PUBLIC_ORIGIN = origin;

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const moduleLoader = Module as unknown as { _load: Loader };
const originalLoad = moduleLoader._load;
moduleLoader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

let db: typeof import("./db");
let route: typeof import("../app/api/learning/[lessonId]/checks/route");
let maintenance: typeof import("./maintenance");
let connection: ReturnType<typeof db.getDb>;

const report = {
  schema_version: "v1", generated_at: "2026-10-22T00:00:00.000Z", overall_score: 50,
  recommendation: "Needs Improvement",
  pillars: Object.fromEntries(["content", "relevance", "clarity", "depth"].map((key) => [key, {
    score: 50, headline: "Need improvement", rationale: "Practice more", evidence_quote: "",
  }])),
  strengths: ["Persistence"], improvements: ["Explain indexes"],
  per_turn: [{ turn_number: 1, topic: "SQL", pillar_scores: {
    content: 50, relevance: 50, clarity: 50, depth: 50,
  }, micro_rubric: { strengths: [], improvements: [] } }],
  next_steps: [
    { title: "Indexes", description: "Learn indexes", duration: "1 week" },
    { title: "Queries", description: "Learn queries", duration: "1 week" },
    { title: "Joins", description: "Learn joins", duration: "1 week" },
  ],
};

const lesson = {
  version: 1, title: "Indexes", goal: "Understand indexes", objectives: ["Explain tradeoffs"],
  explanation: "Indexes speed up reads at write cost.", example: "Index customer id.",
  sections: [{ heading: "Basics", body: "An index is a data structure." }],
  questions: [
    { stem: "First?", options: [
      { id: "A", text: "First answer" }, { id: "B", text: "Other answer" }, { id: "C", text: "Third answer" },
    ], correctOption: "A", explanation: "Because the first is correct." },
    { stem: "Second?", options: [
      { id: "A", text: "First answer" }, { id: "B", text: "Other answer" }, { id: "C", text: "Third answer" },
    ], correctOption: "B", explanation: "Because the second is correct." },
  ],
};

function structuredLesson(mode: "fundamentals" | "answering") {
  const common = {
    version: 2, mode, title: "Indexes", goal: "Understand when an index improves a query.",
    objectives: ["Explain how an index affects a selective lookup."], questions: lesson.questions,
  };
  return mode === "fundamentals" ? {
    ...common, concepts: [
      { term: "Index", meaning: "A structure that maps a search key to rows in a table." },
      { term: "Scan", meaning: "Reading the table rows one by one to find matching data." },
    ],
    mechanism: "An index narrows the rows that need reading, though its usefulness depends on the query and data.",
    walkthrough: {
      situation: "Find all orders belonging to one customer in a large table.",
      input: "An orders table has customer_id values and a query filters by one customer_id.",
      steps: [
        { action: "Find the customer_id in the index.", reason: "The key points to candidate rows instead of scanning every row." },
        { action: "Fetch the matching orders from the table.", reason: "The full order data remains in the underlying rows." },
      ],
      result: "The query can examine fewer rows when that customer has relatively few orders.",
      why: "The index identifies candidate rows, but the query planner still decides whether it helps.",
    },
  } : {
    ...common, interviewQuestion: "When would you add an index on customer_id?",
    modelAnswer: "I would inspect the slow query and its execution plan first. If it filters selectively by customer_id, I would test an index and compare before and after. I would also account for the extra storage and work on each write, because indexes are not free.",
    annotations: [
      { point: "Start with evidence from the execution plan.", reason: "An index cannot fix every cause of a slow query." },
      { point: "Measure the effect on the real workload.", reason: "Selectivity and query shape determine whether it helps." },
    ],
    tradeOff: { benefit: "Selective reads can inspect fewer rows.", cost: "Writes maintain the index and storage increases.", when: "Use it when measured read benefits justify those costs." },
    followUps: [{ question: "What if the index is not used?", answer: "Inspect the plan and selectivity before changing the index or query." }],
  };
}

before(async () => {
  [db, route, maintenance] = await Promise.all([
    import("./db"), import("../app/api/learning/[lessonId]/checks/route"), import("./maintenance"),
  ]);
  connection = db.getDb();
});

after(() => {
  if (connection) connection.close();
  moduleLoader._load = originalLoad;
  if (oldDbPath === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = oldDbPath;
  if (oldOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = oldOrigin;
  rmSync(temp, { recursive: true, force: true });
});

let lessonId: string;
let sessionId: string;
beforeEach(() => {
  connection.prepare("DELETE FROM sessions").run();
  sessionId = randomUUID();
  lessonId = randomUUID();
  const json = JSON.stringify(report);
  connection.prepare(`INSERT INTO sessions
    (id, role, language, mode, planned_rounds, provider, model, status)
    VALUES (?, 'Engineer', 'en', 'strict', 2, 'openai', 'gpt-4', 'completed')`).run(sessionId);
  connection.prepare(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
    VALUES (?, ?, 50, 'Needs Improvement')`).run(sessionId, json);
  connection.prepare(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status,
      lesson_json, provider, model)
    VALUES (?, ?, ?, 'improvement', 0, 'fundamentals', 'Explain indexes', 'ready', ?, 'openai', 'gpt-4')`)
    .run(lessonId, sessionId, createHash("sha256").update(json).digest("hex"), JSON.stringify(lesson));
});

function post(answers: unknown, clientAttemptId = randomUUID(), custom?: { origin?: string; lessonId?: string }) {
  return route.POST(new Request(`https://interview.example.com/api/learning/${custom?.lessonId ?? lessonId}/checks`, {
    method: "POST", headers: { origin: custom?.origin ?? origin, "content-type": "application/json" },
    body: JSON.stringify({ clientAttemptId, answers }),
  }), { params: { lessonId: custom?.lessonId ?? lessonId } });
}

function get(id = lessonId) {
  return route.GET(new Request(`https://interview.example.com/api/learning/${id}/checks`),
    { params: { lessonId: id } });
}

function count(id = lessonId): number {
  return (connection.prepare(`SELECT count(*) AS n FROM learning_check_attempts WHERE lesson_id = ?`)
    .get(id) as { n: number }).n;
}

test("GET before submission has no answer or explanation; grades zero, partial, full and reloads history", async () => {
  const empty = await get();
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("cache-control"), "private, no-store");
  assert.equal(empty.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await empty.json(), { ok: true, attempts: [] });
  for (const [answers, score] of [["C", "A"], ["A", "C"], ["A", "B"]].map((a, index) => [a, index] as const)) {
    const response = await post(answers);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.attempt.score, score);
    assert.equal(result.attempt.total, 2);
    assert.deepEqual(result.attempt.answers, answers);
    assert.deepEqual(result.attempt.questions.map((q: { isCorrect: boolean }) => q.isCorrect),
      answers.map((answer, i) => answer === ["A", "B"][i]));
    assert.deepEqual(result.attempt.questions.map((q: { correctOption: string }) => q.correctOption), ["A", "B"]);
    assert.match(result.attempt.questions[0].explanation, /first/);
  }
  const history = await (await get()).json();
  assert.equal(history.attempts.length, 3);
  assert.deepEqual(history.attempts.map((attempt: { score: number }) => attempt.score), [0, 1, 2]);
  assert.equal(count(), 3);
});

test("both v2 modes preserve private answer keys, grading and independent history", async () => {
  const detail = await import("../app/api/learning/[lessonId]/route");
  const answeringId = randomUUID();
  connection.prepare(`UPDATE learning_lessons SET lesson_json = ? WHERE id = ?`)
    .run(JSON.stringify(structuredLesson("fundamentals")), lessonId);
  connection.prepare(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status,
      lesson_json, provider, model)
    SELECT ?, session_id, report_revision, source_kind, source_index, 'answering', source_label, status,
      ?, provider, model FROM learning_lessons WHERE id = ?`)
    .run(answeringId, JSON.stringify(structuredLesson("answering")), lessonId);
  for (const id of [lessonId, answeringId]) {
    const response = await detail.GET(new Request(`${origin}/api/learning/${id}`), { params: { lessonId: id } });
    assert.equal(response.status, 200);
    const raw = await response.text();
    assert.ok(!raw.includes("correctOption"));
    assert.ok(!raw.includes("Because the first is correct."));
    assert.equal((await get(id)).status, 200);
    const submitted = await post(["A", "B"], randomUUID(), { lessonId: id });
    assert.equal(submitted.status, 200);
    assert.equal((await submitted.json()).attempt.score, 2);
    assert.equal((await (await get(id)).json()).attempts.length, 1);
  }
  assert.equal(count(), 1);
  assert.equal(count(answeringId), 1);
  connection.prepare("UPDATE learning_lessons SET lesson_json = ? WHERE id = ?")
    .run(JSON.stringify(structuredLesson("answering")), lessonId);
  assert.equal((await detail.GET(new Request(`${origin}/api/learning/${lessonId}`), { params: { lessonId } })).status, 404);
  assert.equal((await get(lessonId)).status, 409);
  assert.equal((await post(["A", "B"])).status, 409);
  assert.equal(count(), 1);
});

test("invalid JSON, missing/out-of-range/extra answers, unknown fields, and oversized streams never write", async () => {
  for (const answers of [[], ["A"], ["A", "B", "C"], ["A", "D"], ["A", 1]]) {
    assert.equal((await post(answers)).status, 400);
  }
  const bad = new Request("https://interview.example.com/api/learning/x/checks", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ clientAttemptId: randomUUID(), answers: ["A", "B"], extra: true }),
  });
  assert.equal((await route.POST(bad, { params: { lessonId } })).status, 400);
  const huge = new Request("https://interview.example.com/api/learning/x/checks", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ clientAttemptId: randomUUID(), answers: ["A", "B"], padding: "x".repeat(5000) }),
  });
  huge.headers.delete("content-length");
  assert.equal((await route.POST(huge, { params: { lessonId } })).status, 413);
  assert.equal(count(), 0);
});

test("same client ID replays old result without a new row, changed answers conflict", async () => {
  const id = randomUUID();
  const first = await (await post(["A", "B"], id)).json();
  const repeated = await (await post(["A", "B"], id)).json();
  assert.deepEqual(repeated, first);
  assert.equal((await post(["C", "B"], id)).status, 409);
  assert.equal(count(), 1);
});

test("saved attempts survive a separate process reopening the SQLite file", async () => {
  const result = await (await post(["A", "B"])).json();
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.env.INTERVIEW_DB_PATH);
    const row = db.prepare('SELECT id, score, total, answers_json FROM learning_check_attempts WHERE id = ?')
      .get(process.env.CHECK_ID);
    process.stdout.write(JSON.stringify(row));
    db.close();
  `], { encoding: "utf8", env: { ...process.env, CHECK_ID: result.attempt.id } });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    id: result.attempt.id, score: 2, total: 2, answers_json: '["A","B"]',
  });
});

test("concurrent distinct client IDs both persist and twenty-attempt cap preserves replay", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => post(["A", "B"])));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(count(), 20);
  const latest = (await results[19].json()).attempt;
  assert.equal((await post(["A", "B"], latest.clientAttemptId)).status, 200);
  assert.equal((await post(["A", "B"])).status, 429);
  assert.equal(count(), 20);
});

test("modes are independent; old report and non-ready lessons cannot submit or expose history", async () => {
  const otherId = randomUUID();
  connection.prepare(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status,
      lesson_json, provider, model)
    SELECT ?, session_id, report_revision, source_kind, source_index, 'answering', source_label, status,
      lesson_json, provider, model FROM learning_lessons WHERE id = ?`).run(otherId, lessonId);
  assert.equal((await post(["A", "B"])).status, 200);
  assert.deepEqual(await (await get(otherId)).json(), { ok: true, attempts: [] });
  assert.equal((await post(["A", "B"], randomUUID(), { lessonId: otherId })).status, 200);
  assert.equal(count(), 1);
  assert.equal(count(otherId), 1);
  connection.prepare("UPDATE evaluations SET report_json = ? WHERE session_id = ?")
    .run(JSON.stringify({ ...report, improvements: ["New advice"] }), sessionId);
  const oldHistory = await (await get()).json();
  assert.equal(oldHistory.attempts.length, 1, "old lessons keep their existing results read-only");
  assert.equal((await post(["A", "B"])).status, 409);
  assert.equal(count(), 1);
});

test("lessons that are not ready are rejected for both submission and history", async () => {
  const pending = randomUUID();
  connection.prepare(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status,
      claim_id, claimed_at, provider, model)
    VALUES (?, ?, ?, 'improvement', 1, 'fundamentals', 'Explain indexes', 'generating',
      'claim-1', 1, 'openai', 'gpt-4')`)
    .run(pending, sessionId, createHash("sha256").update(JSON.stringify(report)).digest("hex"));
  const failed = randomUUID();
  connection.prepare(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status, provider, model)
    VALUES (?, ?, ?, 'improvement', 1, 'answering', 'Explain indexes', 'failed', 'openai', 'gpt-4')`)
    .run(failed, sessionId, createHash("sha256").update(JSON.stringify(report)).digest("hex"));
  for (const id of [pending, failed]) {
    assert.equal((await get(id)).status, 409);
    assert.equal((await post(["A", "B"], randomUUID(), { lessonId: id })).status, 409);
  }
  assert.equal(count(pending), 0);
  assert.equal(count(failed), 0);
  const missing = await get(randomUUID());
  assert.equal(missing.status, 404);
});

test("origin guard rejects before body/DB; maintenance blocks mutations without reading body", async () => {
  let read = false;
  const request = (requestOrigin: string) => ({
    headers: new Headers({ origin: requestOrigin }),
    get body() { read = true; throw new Error("body read"); },
  }) as unknown as Request;
  assert.equal((await route.POST(request("https://evil.example"), { params: { lessonId } })).status, 403);
  assert.equal(read, false);
  const release = maintenance.enterMaintenance();
  assert.ok(release);
  try {
    assert.equal((await route.POST(request(origin), { params: { lessonId } })).status, 409);
    assert.equal(read, false);
  } finally {
    release();
  }
  assert.equal(count(), 0);
});
