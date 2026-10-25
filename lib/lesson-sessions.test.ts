import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const origin = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const dir = mkdtempSync(join(tmpdir(), "lesson-sessions-"));
process.env.INTERVIEW_DB_PATH = join(dir, "sessions.db");
process.env.PUBLIC_ORIGIN = origin;

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

let db: typeof import("./db");
let sessions: typeof import("../app/api/sessions/route");
let detail: typeof import("../app/api/sessions/[id]/route");
let lessonSessions: typeof import("../app/api/learning/[lessonId]/sessions/route");
let lessonDetail: typeof import("../app/api/learning/[lessonId]/route");
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
const lessonContent = {
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
const revision = createHash("sha256").update(JSON.stringify(report)).digest("hex");
let parentId: string;

before(async () => {
  [db, sessions, detail, lessonSessions, lessonDetail] = await Promise.all([
    import("./db"), import("../app/api/sessions/route"),
    import("../app/api/sessions/[id]/route"), import("../app/api/learning/[lessonId]/sessions/route"),
    import("../app/api/learning/[lessonId]/route"),
  ]);
  connection = db.getDb();
});
after(() => {
  if (connection) connection.close();
  loader._load = originalLoad;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previousOrigin;
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  db.exec("DELETE FROM sessions");
  db.exec("DELETE FROM model_configs");
  parentId = randomUUID();
  db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
    VALUES (?, 'Source Engineer', 'en', 'strict', 5, 'openai', 'test-model', 'completed')`, [parentId]);
  db.exec(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
    VALUES (?, ?, 50, 'Needs Improvement')`, [parentId, JSON.stringify(report)]);
});

type LessonStatus = "ready" | "generating" | "failed";
function addLesson(options: { status?: LessonStatus; label?: string; kind?: "improvement" | "next_step";
  index?: number; mode?: "fundamentals" | "answering"; content?: string; parent?: string } = {}) {
  const id = randomUUID();
  const status = options.status ?? "ready";
  db.exec(`INSERT INTO learning_lessons
    (id, session_id, report_revision, source_kind, source_index, mode, source_label, status,
     claim_id, claimed_at, lesson_json, provider, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'openai', 'test-model')`, [
    id, options.parent ?? parentId, revision, options.kind ?? "improvement", options.index ?? 0,
    options.mode ?? "fundamentals", options.label ?? "Explain indexes", status,
    status === "generating" ? randomUUID() : null,
    status === "generating" ? 1 : null,
    status === "ready" ? (options.content ?? JSON.stringify(lessonContent)) : null,
  ]);
  return id;
}
function request(body: Record<string, unknown>) {
  return new Request(`${origin}/api/sessions`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-api-key": "test-key" },
    body: JSON.stringify({
      provider: "openai", model: "test-model", temperature: 0.5, maxTokens: 2048, topP: 0.9,
      role: "Backend Engineer", language: "en", mode: "strict", plannedRounds: 5,
      cvSource: "none", ...body,
    }),
  });
}
async function create(body: Record<string, unknown>) {
  const response = await sessions.POST(request(body));
  return { response, json: await response.json() };
}
async function getSession(id: string) {
  const response = await detail.GET(new Request(`${origin}/api/sessions/${id}`), { params: { id } });
  assert.equal(response.status, 200);
  return (await response.json()).session;
}
async function list(id: string, cursor?: string) {
  const url = new URL(`${origin}/api/learning/${id}/sessions`);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  const response = await lessonSessions.GET(new Request(url), { params: { lessonId: id } });
  return { response, json: await response.json() };
}
function count(): number {
  return db.queryOne<{ n: number }>("SELECT count(*) n FROM sessions")!.n;
}

test("ready saved lesson prepends immutable canonical focus; extras are normalized and detail carries origin metadata", async () => {
  const id = addLesson({ label: "  <b>Index</b> https://example.test/doc  `plans`  " });
  const { response, json } = await create({ originLessonId: id, focus: ["  Query plans  ", "Retries"] });
  assert.equal(response.status, 200, JSON.stringify(json));
  const row = db.queryOne<{ focus_json: string; origin_lesson_id: string }>(
    "SELECT focus_json, origin_lesson_id FROM sessions WHERE id = ?", [json.sessionId]);
  assert.equal(row?.origin_lesson_id, id);
  assert.deepEqual(JSON.parse(row!.focus_json), ["Index plans", "Query plans", "Retries"]);
  const saved = await getSession(json.sessionId);
  assert.deepEqual(saved.focus, ["Index plans", "Query plans", "Retries"]);
  assert.deepEqual(saved.originLesson, {
    id, sessionId: parentId, kind: "improvement", index: 0,
    label: "  <b>Index</b> https://example.test/doc  `plans`  ",
  });
  db.exec("UPDATE learning_lessons SET source_label = ? WHERE id = ?", ["Changed label", id]);
  assert.deepEqual((await getSession(json.sessionId)).focus, ["Index plans", "Query plans", "Retries"],
    "the session must keep its original focus snapshot after lesson edits");
});

test("nonready, malformed saved content, unknown and malformed IDs cannot create linked sessions", async () => {
  const ids = [
    addLesson({ status: "generating" }), addLesson({ status: "failed", index: 1 }),
    addLesson({ index: 2, content: "{" }), addLesson({ index: 3, content: JSON.stringify({ ...lessonContent, questions: [] }) }),
    randomUUID(), "not-a-uuid",
  ];
  for (const id of ids) {
    const { response } = await create({ originLessonId: id });
    assert.equal(response.status, 400, id);
  }
  assert.equal(count(), 1);
  assert.equal(db.queryOne<{ n: number }>("SELECT count(*) n FROM model_configs")!.n, 0);
});

test("linked focus permits exactly two extra topics, rejects a third and malformed entries without writes", async () => {
  const id = addLesson();
  for (const focus of [["one", "two", "three"], [""], ["x".repeat(121)], "topic", [42]]) {
    const { response } = await create({ originLessonId: id, focus });
    assert.equal(response.status, 400, JSON.stringify(focus));
  }
  assert.equal(count(), 1);
  assert.equal(db.queryOne<{ n: number }>("SELECT count(*) n FROM model_configs")!.n, 0);
  const { response, json } = await create({ originLessonId: id, focus: ["one", "two"] });
  assert.equal(response.status, 200, JSON.stringify(json));
  assert.deepEqual((await getSession(json.sessionId)).focus, ["Explain indexes", "one", "two"]);
});

test("the user may edit or drop the lesson topic; the origin link survives", async () => {
  const id = addLesson({ label: "Explain indexes" });

  // Dropped: only the extra topics remain, and all three slots are free.
  const dropped = await create({ originLessonId: id, lessonFocus: null, focus: ["one", "two", "three"] });
  assert.equal(dropped.response.status, 200, JSON.stringify(dropped.json));
  const droppedRow = db.queryOne<{ focus_json: string; origin_lesson_id: string | null }>(
    "SELECT focus_json, origin_lesson_id FROM sessions WHERE id = ?", [dropped.json.sessionId]);
  assert.deepEqual(JSON.parse(droppedRow!.focus_json), ["one", "two", "three"]);
  assert.equal(droppedRow!.origin_lesson_id, id, "the origin link must survive the removal");

  // Edited: the replacement takes the lesson slot, the extra topics follow.
  const edited = await create({ originLessonId: id, lessonFocus: "  Redis connection pool  ", focus: ["one"] });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.json));
  const editedRow = db.queryOne<{ focus_json: string; origin_lesson_id: string | null }>(
    "SELECT focus_json, origin_lesson_id FROM sessions WHERE id = ?", [edited.json.sessionId]);
  assert.deepEqual(JSON.parse(editedRow!.focus_json), ["Redis connection pool", "one"]);
  assert.equal(editedRow!.origin_lesson_id, id);
  assert.deepEqual((await getSession(edited.json.sessionId)).focus, ["Redis connection pool", "one"]);
});

test("an invalid lesson topic is rejected without writes", async () => {
  const id = addLesson();
  // A lesson topic without an origin lesson is meaningless.
  for (const lessonFocus of [null, "Redis"]) {
    const { response } = await create({ lessonFocus });
    assert.equal(response.status, 400, JSON.stringify(lessonFocus));
  }
  // Malformed lesson topics are rejected.
  for (const lessonFocus of ["", "   ", "x".repeat(121), 42, {}]) {
    const { response } = await create({ originLessonId: id, lessonFocus });
    assert.equal(response.status, 400, JSON.stringify(lessonFocus));
  }
  // Dropping the topic frees the third slot, but not a fourth one.
  const tooMany = await create({ originLessonId: id, lessonFocus: null, focus: ["a", "b", "c", "d"] });
  assert.equal(tooMany.response.status, 400);
  // A kept topic still leaves room for only two extra topics.
  const tooManyWithTopic = await create({ originLessonId: id, lessonFocus: "Redis", focus: ["a", "b", "c"] });
  assert.equal(tooManyWithTopic.response.status, 400);

  assert.equal(count(), 1);
  assert.equal(db.queryOne<{ n: number }>("SELECT count(*) n FROM model_configs")!.n, 0);
});

test("different lesson IDs stay distinct even for the same source label and report", async () => {
  const first = addLesson();
  const second = addLesson({ mode: "answering" });
  const a = await create({ originLessonId: first });
  const b = await create({ originLessonId: second });
  assert.equal(a.response.status, 200, JSON.stringify(a.json));
  assert.equal(b.response.status, 200, JSON.stringify(b.json));
  assert.equal((await getSession(a.json.sessionId)).originLesson.id, first);
  assert.equal((await getSession(b.json.sessionId)).originLesson.id, second);
  assert.deepEqual((await list(first)).json.sessions.map((s: { id: string }) => s.id), [a.json.sessionId]);
  assert.deepEqual((await list(second)).json.sessions.map((s: { id: string }) => s.id), [b.json.sessionId]);
});

test("lesson list pages 20 at a time with timestamp ties, score, and rejects foreign or malformed cursors", async () => {
  const first = addLesson();
  const second = addLesson({ mode: "answering" });
  const firstIds: string[] = [];
  for (let i = 0; i < 43; i++) {
    const id = `sess_practice_${String(i).padStart(3, "0")}`;
    firstIds.push(id);
    db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status,
      origin_lesson_id, created_at) VALUES (?, 'Practice', 'en', 'strict', 5, 'openai', 'test-model',
      'completed', ?, ?)`, [id, first, 1700000000 + Math.floor(i / 2)]);
  }
  db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status,
    origin_lesson_id, created_at) VALUES ('sess_foreign', 'Other', 'en', 'strict', 5, 'openai', 'test-model',
    'active', ?, 1700000099)`, [second]);
  db.exec(`INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
    VALUES (?, '{}', 84, 'hire')`, [firstIds[42]]);
  const visited: string[] = [];
  const lengths: number[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const { response, json } = await list(first, cursor);
    assert.equal(response.status, 200);
    lengths.push(json.sessions.length);
    visited.push(...json.sessions.map((s: { id: string }) => s.id));
    assert.equal(json.hasMore, page < 2);
    assert.equal(json.nextCursor, page < 2 ? json.sessions.at(-1).id : null);
    cursor = json.nextCursor ?? undefined;
  }
  assert.deepEqual(lengths, [20, 20, 3]);
  assert.deepEqual(visited, [...firstIds].reverse());
  assert.equal(new Set(visited).size, 43);
  const top = (await list(first)).json.sessions[0];
  assert.deepEqual(top, { id: firstIds[42], role: "Practice", status: "completed",
    createdAt: 1700000021, overallScore: 84 });
  for (const bad of ["sess_foreign", "not a cursor", "missing_cursor"] ) {
    const { response, json } = await list(first, bad);
    assert.equal(response.status, 400, JSON.stringify(json));
  }
  assert.equal((await list(randomUUID())).response.status, 404);
});

test("deleting the lesson's source session cascades the lesson but SET NULL retains the practice session", async () => {
  const id = addLesson();
  const created = await create({ originLessonId: id });
  assert.equal(created.response.status, 200, JSON.stringify(created.json));
  const practiceId = created.json.sessionId;
  const deletion = await detail.DELETE(new Request(`${origin}/api/sessions/${parentId}`, {
    method: "DELETE", headers: { origin },
  }), { params: { id: parentId } });
  assert.equal(deletion.status, 200);
  assert.equal(db.queryOne("SELECT id FROM learning_lessons WHERE id = ?", [id]), undefined);
  assert.equal(db.queryOne<{ origin_lesson_id: string | null }>(
    "SELECT origin_lesson_id FROM sessions WHERE id = ?", [practiceId])?.origin_lesson_id, null);
  const saved = await getSession(practiceId);
  assert.equal(saved.originLesson, null);
  assert.deepEqual(saved.focus, ["Explain indexes"]);
  assert.equal((await list(id)).response.status, 404);
});

test("historical lesson remains linkable and lists past/new sessions after report revision changes", async () => {
  const id = addLesson({ kind: "next_step", label: "Review joins" });
  const currentLesson = await lessonDetail.GET(new Request(`${origin}/api/learning/${id}`), { params: { lessonId: id } });
  assert.equal(currentLesson.status, 200);
  assert.equal((await currentLesson.json()).oldRevision, false);
  const old = await create({ originLessonId: id });
  assert.equal(old.response.status, 200, JSON.stringify(old.json));
  db.exec("UPDATE evaluations SET report_json = ? WHERE session_id = ?", [
    JSON.stringify({ ...report, next_steps: [
      { title: "New topic", description: "New", duration: "1 week" }, ...report.next_steps.slice(1),
    ] }), parentId,
  ]);
  const lessonResponse = await lessonDetail.GET(new Request(`${origin}/api/learning/${id}`), { params: { lessonId: id } });
  assert.equal(lessonResponse.status, 200);
  assert.equal((await lessonResponse.json()).oldRevision, true);
  const current = await create({ originLessonId: id });
  assert.equal(current.response.status, 200, JSON.stringify(current.json));
  assert.deepEqual((await getSession(current.json.sessionId)).focus, ["Review joins"]);
  const listed = await list(id);
  assert.equal(listed.response.status, 200);
  assert.deepEqual(new Set(listed.json.sessions.map((s: { id: string }) => s.id)),
    new Set([old.json.sessionId, current.json.sessionId]));
});
