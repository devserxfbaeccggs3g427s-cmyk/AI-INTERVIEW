/**
 * L-03 — lesson creation is charged work, so every guard that prevents a second
 * provider call is asserted here rather than assumed:
 *
 *  - browsing a topic (GET) must never reach the provider;
 *  - a double click / second tab must observe the same claim, not a second call;
 *  - `ready` is terminal, `failed` and expired claims need an explicit retry;
 *  - a replaced report, a provider that is not the session's, or a wrong Origin
 *    must fail before any model call or row write;
 *  - invalid, truncated or oversized output becomes `failed`, never a half lesson;
 *  - a timeout aborts the request and leaves nothing persisted but the failure.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const origin = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const previousPrivate = process.env.ALLOW_PRIVATE_BASE_URL;
const previousEnabled = process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
const tmpDir = mkdtempSync(join(tmpdir(), "learning-generation-"));
// Must be set before ./db is imported: lib/db.ts resolves the path at module load.
process.env.INTERVIEW_DB_PATH = join(tmpDir, "test.db");
process.env.PUBLIC_ORIGIN = origin;
process.env.ALLOW_PRIVATE_BASE_URL = "1";
process.env.NEXT_PUBLIC_PROVIDER_ENABLE = "custom";

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const moduleLoader = Module as unknown as { _load: Loader };
const originalLoad = moduleLoader._load;
moduleLoader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

let db: typeof import("./db");
let generation: typeof import("./learning-generation");
let catalogRoute: typeof import("../app/api/sessions/[id]/learning/route");
let detailRoute: typeof import("../app/api/learning/[lessonId]/route");
let source: typeof import("./learning-source");
let connection: ReturnType<typeof db.getDb>;

let server: Server;
let baseUrl: string;
interface Scripted { body: string; finishReason: string; hang?: boolean }
let script: Scripted[] = [];
/** Every provider round-trip the mock actually served — the cost ledger. */
let calls = 0;

before(async () => {
  [db, generation, catalogRoute, detailRoute, source] = await Promise.all([
    import("./db"), import("./learning-generation"),
    import("../app/api/sessions/[id]/learning/route"),
    import("../app/api/learning/[lessonId]/route"),
    import("./learning-source"),
  ]);
  connection = db.getDb();
  server = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions") { res.writeHead(404); res.end(); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    calls += 1;
    const next = script.shift() ?? { body: "{}", finishReason: "stop" };
    if (next.hang) { res.writeHead(200, { "content-type": "text/event-stream" }); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: next.body } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: next.finishReason }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local mock port");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

beforeEach(() => { script = []; calls = 0; });

after(async () => {
  connection.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
  moduleLoader._load = originalLoad;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previousOrigin;
  if (previousPrivate === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previousPrivate;
  if (previousEnabled === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
  else process.env.NEXT_PUBLIC_PROVIDER_ENABLE = previousEnabled;
});

const pillar = { score: 50, headline: "h", rationale: "r", evidence_quote: "" };
const report = {
  schema_version: "v1", generated_at: "2026-10-22T00:00:00.000Z", overall_score: 50,
  recommendation: "Needs Improvement",
  pillars: { content: pillar, relevance: pillar, clarity: pillar, depth: pillar },
  strengths: ["Persistence"],
  improvements: ["Explain database indexes", "Measure p99 latency"],
  per_turn: [{ turn_number: 1, topic: "SQL", pillar_scores: {
    content: 50, relevance: 50, clarity: 50, depth: 50,
  }, micro_rubric: { strengths: [], improvements: [] } }],
  next_steps: [
    { title: "Indexes", description: "Study indexes", duration: "1 week" },
    { title: "Queries", description: "Study queries", duration: "1 week" },
    { title: "Joins", description: "Study joins", duration: "1 week" },
  ],
  hiring_probability_pct: 40,
};

/** A body that satisfies LessonSchema exactly. */
function validLesson(title = "Indexes"): string {
  return JSON.stringify({
    version: 1, title, goal: "Understand indexes", objectives: ["Explain trade-offs"],
    explanation: "An index is a data structure that speeds up lookups.",
    example: "CREATE INDEX ON orders(customer_id).",
    sections: [{ heading: "Basics", body: "Reads get faster, writes pay more." }],
    questions: [
      { stem: "What does an index cost?", options: [
        { id: "A", text: "Faster reads" }, { id: "B", text: "Slower writes" }, { id: "C", text: "No cost" },
      ], correctOption: "B", explanation: "Writes must update the index." },
      { stem: "When is it useless?", options: [
        { id: "A", text: "Low cardinality" }, { id: "B", text: "Selective" }, { id: "C", text: "Composite" },
      ], correctOption: "A", explanation: "Low selectivity matches too many rows." },
    ],
  });
}

let sessionSeq = 0;
function seedSession(provider = "custom", model = "local-model", baseUrlOverride: string | null = baseUrl): string {
  const id = `sess_${++sessionSeq}`;
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model,
       base_url, temperature, max_tokens, top_p, cv_source)
     VALUES (?, 'Backend', 'vi', 'strict', 8, 'completed', ?, ?, ?, 0.4, 4096, 0.95, 'none')`,
    [id, provider, model, baseUrlOverride],
  );
  db.exec(
    `INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
     VALUES (?, ?, 50, 'Needs Improvement')`,
    [id, JSON.stringify(report)],
  );
  return id;
}

function request(sessionId: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/learning`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-api-key": "sk-test-key", ...headers },
    body: JSON.stringify(body),
  });
}

/** Read lazily: the mock server port is only known after `before` runs. */
function config(overrides: Record<string, unknown> = {}) {
  return { provider: "custom", model: "local-model", baseUrl, ...overrides };
}

async function post(sessionId: string, mode: "fundamentals" | "answering", index = 0, extra: Record<string, unknown> = {}) {
  const revision = source.loadLearningSource(sessionId, "improvement", index)?.reportRevision ?? "";
  return catalogRoute.POST(
    request(sessionId, { revision, kind: "improvement", index, mode, config: config(), ...extra }),
    { params: { id: sessionId } },
  );
}

test("reading a topic never calls the provider and describes both modes", async () => {
  const sessionId = seedSession();
  const res = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement&index=0`),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 0, "GET must not reach the provider");
  const body = await res.json() as {
    source: { label: string; revision: string; provider: string; model: string };
    modes: Record<string, { status: string; retryable: boolean; id?: string }>;
    older: unknown[];
  };
  // The catalog shows the original report prose, not the bounded snapshot.
  assert.equal(body.source.label, "Explain database indexes");
  assert.match(body.source.revision, /^[0-9a-f]{64}$/);
  assert.equal(body.source.provider, "custom");
  assert.equal(body.modes.fundamentals.status, "uncreated");
  assert.equal(body.modes.fundamentals.retryable, false);
  assert.equal(body.modes.answering.status, "uncreated");
  assert.deepEqual(body.older, []);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
});

test("the catalog rejects an out-of-range or unknown source instead of inventing one", async () => {
  const sessionId = seedSession();
  const missing = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement&index=99`),
    { params: { id: sessionId } },
  );
  assert.equal(missing.status, 404);
  const bad = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement`),
    { params: { id: sessionId } },
  );
  assert.equal(bad.status, 400);
  assert.equal(calls, 0);
});

test("one create call stores exactly one ready lesson with a provider snapshot", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson(), finishReason: "stop" }];
  const res = await post(sessionId, "fundamentals");
  assert.equal(res.status, 200);
  const body = await res.json() as { id: string; status: string };
  assert.equal(body.status, "ready");
  assert.equal(calls, 1);

  const row = db.queryOne<Record<string, unknown>>(
    `SELECT * FROM learning_lessons WHERE id = ?`, [body.id],
  );
  assert.ok(row);
  assert.equal(row.status, "ready");
  assert.equal(row.claim_id, null);
  assert.equal(row.claimed_at, null);
  assert.equal(row.provider, "custom");
  assert.equal(row.model, "local-model");
  assert.equal(row.base_url, baseUrl);
  assert.equal(row.source_kind, "improvement");
  assert.equal(row.source_index, 0);
  assert.equal(row.mode, "fundamentals");
  // The BYOK key is never persisted anywhere in the row.
  assert.equal(JSON.stringify(row).includes("sk-test-key"), false);

  const detail = await detailRoute.GET(new Request("http://localhost/api/learning/x"), {
    params: { lessonId: body.id },
  });
  const detailBody = await detail.json() as {
    lesson: { sessionId: string; content: { questions: Record<string, unknown>[] }; source: { label: string } };
    oldRevision: boolean;
  };
  assert.equal(detailBody.lesson.sessionId, sessionId);
  assert.equal(detailBody.oldRevision, false);
  assert.equal(detailBody.lesson.source.label, "Explain database indexes");
  assert.equal("correctOption" in detailBody.lesson.content.questions[0], false);
  assert.equal("explanation" in detailBody.lesson.content.questions[0], false);
});

test("a ready lesson is terminal: a repeat create returns it without a second call", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson(), finishReason: "stop" }];
  const first = await (await post(sessionId, "answering")).json() as { id: string };

  const second = await post(sessionId, "answering");
  assert.equal(second.status, 200);
  const body = await second.json() as { id: string; status: string };
  assert.equal(body.id, first.id);
  assert.equal(body.status, "ready");
  assert.equal(calls, 1, "a ready slot must never call the provider again");
});

test("two concurrent creates produce one provider call and one lesson", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson(), finishReason: "stop" }];
  const responses = await Promise.all([post(sessionId, "fundamentals"), post(sessionId, "fundamentals")]);
  const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ id: string; status: string }>));
  assert.equal(calls, 1, "the second tab must join the first claim");
  assert.equal(new Set(bodies.map((b) => b.id)).size, 1);
  assert.deepEqual(bodies.map((b) => b.status).sort(), ["generating", "ready"]);
  assert.equal(db.query<Record<string, unknown>>(
    `SELECT id FROM learning_lessons WHERE session_id = ? AND mode = 'fundamentals'`, [sessionId],
  ).length, 1);
});

test("output that does not match the lesson schema fails instead of storing a partial lesson", async () => {
  const sessionId = seedSession();
  script = [{ body: JSON.stringify({ version: 1, title: "no body" }), finishReason: "stop" }];
  const res = await post(sessionId, "fundamentals");
  assert.equal(res.status, 502);
  assert.equal(calls, 1, "invalid output is not repaired with a second paid call");
  const row = db.queryOne<{ status: string; lesson_json: string | null }>(
    `SELECT status, lesson_json FROM learning_lessons WHERE session_id = ?`, [sessionId],
  );
  assert.equal(row?.status, "failed");
  assert.equal(row?.lesson_json, null);

  const catalog = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement&index=0`),
    { params: { id: sessionId } },
  );
  const modes = (await catalog.json() as { modes: Record<string, { retryable: boolean }> }).modes;
  assert.equal(modes.fundamentals.retryable, true, "a failure must offer an explicit retry");
});

test("a fenced claim cannot write over a retry that already started", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson(), finishReason: "stop" }];
  const first = await (await post(sessionId, "fundamentals")).json() as { id: string };

  // Simulate a crashed run: the slot is left generating with an expired claim.
  db.exec(`UPDATE learning_lessons SET status = 'generating', lesson_json = NULL,
           claim_id = 'stale-claim', claimed_at = unixepoch() - 10000 WHERE id = ?`, [first.id]);
  script = [{ body: validLesson("Second attempt"), finishReason: "stop" }];
  const retried = await post(sessionId, "fundamentals", 0, { retry: true });
  assert.equal(retried.status, 200);
  assert.equal(calls, 2);
  const row = db.queryOne<{ lesson_json: string }>(
    `SELECT lesson_json FROM learning_lessons WHERE id = ?`, [first.id],
  );
  assert.equal(JSON.parse(row?.lesson_json ?? "{}").title, "Second attempt");

  // The late response of the fenced claim must not overwrite the newer lesson.
  const stale = source.loadLearningSource(sessionId, "improvement", 0);
  assert.ok(stale);
  const cfg = {
    provider: "custom", model: "local-model", base_url: baseUrl, temperature: 0.2,
    max_tokens: 500, top_p: 0.9, _base: baseUrl,
  } as unknown as import("./providers/types").AuthedConfig;
  const outcome = await generation.generateLearningLesson(
    stale, "fundamentals", cfg, first.id, "stale-claim",
  );
  assert.equal(outcome, "changed");
  assert.equal(JSON.parse(
    db.queryOne<{ lesson_json: string }>("SELECT lesson_json FROM learning_lessons WHERE id = ?", [first.id])?.lesson_json ?? "{}",
  ).title, "Second attempt");
});

test("an expired claim needs an explicit retry and keeps the original destination", async () => {
  const sessionId = seedSession();
  const current = source.loadLearningSource(sessionId, "improvement", 0);
  assert.ok(current);
  db.exec(
    `INSERT INTO learning_lessons (id, session_id, report_revision, source_kind, source_index, mode,
       source_label, source_context, status, claim_id, claimed_at, lesson_json, provider, model, base_url)
     VALUES ('l_expired', ?, ?, 'improvement', 0, 'fundamentals', 'Explain database indexes', NULL,
             'generating', 'dead-claim', unixepoch() - 10000, NULL, 'custom', 'local-model', ?)`,
    [sessionId, current.reportRevision, baseUrl],
  );

  const blocked = await post(sessionId, "fundamentals");
  assert.equal(blocked.status, 409);
  assert.equal(calls, 0, "an expired claim is not silently retried");

  script = [{ body: validLesson(), finishReason: "stop" }];
  const retried = await post(sessionId, "fundamentals", 0, { retry: true });
  assert.equal(retried.status, 200);
  assert.equal(calls, 1);
  const row = db.queryOne<{ base_url: string; status: string }>(
    `SELECT base_url, status FROM learning_lessons WHERE id = 'l_expired'`,
  );
  assert.equal(row?.base_url, baseUrl);
  assert.equal(row?.status, "ready");
});

test("a provider that is not the session's is refused before any model call", async () => {
  const sessionId = seedSession();
  const revision = source.loadLearningSource(sessionId, "improvement", 0)?.reportRevision ?? "";
  const wrongModel = await catalogRoute.POST(
    request(sessionId, {
      revision, kind: "improvement", index: 0, mode: "fundamentals",
      config: config({ model: "some-other-model" }),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(wrongModel.status, 409);
  assert.equal(calls, 0);
  assert.equal(db.query(`SELECT id FROM learning_lessons WHERE session_id = ?`, [sessionId]).length, 0);
});

test("a missing BYOK key is reported without calling the provider", async () => {
  // `custom` accepts a keyless local endpoint, so this guard needs a hosted session.
  const sessionId = seedSession("openai", "gpt-4o-mini", null);
  const revision = source.loadLearningSource(sessionId, "improvement", 0)?.reportRevision ?? "";
  const res = await catalogRoute.POST(
    new Request(`http://localhost/api/sessions/${sessionId}/learning`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        revision, kind: "improvement", index: 0, mode: "fundamentals",
        config: { provider: "openai", model: "gpt-4o-mini" },
      }),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 400);
  assert.equal(calls, 0);
  assert.equal((await res.text()).toLowerCase().includes("key"), true);
  assert.equal(db.query(`SELECT id FROM learning_lessons WHERE session_id = ?`, [sessionId]).length, 0);
});

test("a provider disabled for this deployment is refused, never silently swapped", async () => {
  const sessionId = seedSession("gemini", "gemini-2.0-flash", null);
  const revision = source.loadLearningSource(sessionId, "improvement", 0)?.reportRevision ?? "";
  const res = await catalogRoute.POST(
    request(sessionId, {
      revision, kind: "improvement", index: 0, mode: "fundamentals",
      config: { provider: "gemini", model: "gemini-2.0-flash" },
    }),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 400);
  assert.equal(calls, 0);
});

test("a stale report revision is refused without calling the provider", async () => {
  const sessionId = seedSession();
  const res = await catalogRoute.POST(
    request(sessionId, {
      revision: "0".repeat(64), kind: "improvement", index: 0, mode: "fundamentals", config: config(),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 409);
  assert.equal(calls, 0);
});

test("a report replaced mid-generation never adopts the new revision's lesson", async () => {
  const sessionId = seedSession();
  const current = source.loadLearningSource(sessionId, "improvement", 0);
  assert.ok(current);
  const cfg = {
    provider: "custom", model: "local-model", base_url: baseUrl, temperature: 0.2,
    max_tokens: 500, top_p: 0.9, _base: baseUrl,
  } as unknown as import("./providers/types").AuthedConfig;
  const claim = generation.claimLearningLesson(current, "fundamentals", cfg, false);
  assert.equal(claim.kind, "claimed");

  // The interview is re-scored: a new report means a new revision.
  db.exec(`UPDATE evaluations SET report_json = ? WHERE session_id = ?`,
    [JSON.stringify({ ...report, improvements: ["Completely different advice"] }), sessionId]);

  script = [{ body: validLesson(), finishReason: "stop" }];
  const outcome = await generation.generateLearningLesson(
    current, "fundamentals", cfg, (claim as { id: string }).id, (claim as { claimId: string }).claimId,
  );
  assert.equal(outcome, "changed");
  assert.equal(db.queryOne<{ lesson_json: string | null }>(
    `SELECT lesson_json FROM learning_lessons WHERE id = ?`, [(claim as { id: string }).id],
  )?.lesson_json, null);
});

test("a request that exceeds the byte cap is refused before the provider", async () => {
  const sessionId = seedSession();
  const res = await catalogRoute.POST(
    new Request(`http://localhost/api/sessions/${sessionId}/learning`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-api-key": "sk-test-key" },
      body: JSON.stringify({ revision: "a".repeat(64), kind: "improvement", index: 0, mode: "fundamentals",
        config: config(), padding: "x".repeat(8_000) }),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 413);
  assert.equal(calls, 0);
});

test("a foreign Origin is rejected before the body, the database or the provider", async () => {
  const sessionId = seedSession();
  const res = await catalogRoute.POST(
    new Request(`http://localhost/api/sessions/${sessionId}/learning`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example.com", "x-api-key": "sk-test-key" },
      body: JSON.stringify({ revision: "a".repeat(64), kind: "improvement", index: 0, mode: "fundamentals", config: config() }),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(res.status, 403);
  assert.equal(calls, 0);
  assert.equal(db.query(`SELECT id FROM learning_lessons WHERE session_id = ?`, [sessionId]).length, 0);
});

test("a hung provider times out, aborts and leaves only a retryable failure", async () => {
  const sessionId = seedSession();
  const current = source.loadLearningSource(sessionId, "improvement", 0);
  assert.ok(current);
  const cfg = {
    provider: "custom", model: "local-model", base_url: baseUrl, temperature: 0.2,
    max_tokens: 500, top_p: 0.9, _base: baseUrl,
  } as unknown as import("./providers/types").AuthedConfig;
  const claim = generation.claimLearningLesson(current, "answering", cfg, false);
  assert.equal(claim.kind, "claimed");
  script = [{ body: "", finishReason: "stop", hang: true }];

  const outcome = await generation.generateLearningLesson(
    current, "answering", cfg, (claim as { id: string }).id, (claim as { claimId: string }).claimId,
    { timeoutMs: 250 },
  );
  assert.equal(outcome, "failed");
  assert.equal(calls, 1);
  const row = db.queryOne<{ status: string; lesson_json: string | null; claim_id: string | null }>(
    `SELECT status, lesson_json, claim_id FROM learning_lessons WHERE id = ?`, [(claim as { id: string }).id],
  );
  assert.equal(row?.status, "failed");
  assert.equal(row?.lesson_json, null);
  assert.equal(row?.claim_id, null);
});

test("a truncated body is rejected without persisting the partial JSON", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson().slice(0, 500), finishReason: "length" }];
  const res = await post(sessionId, "fundamentals");
  assert.equal(res.status, 502);
  assert.equal(calls, 1);
  assert.equal(db.queryOne<{ lesson_json: string | null }>(
    `SELECT lesson_json FROM learning_lessons WHERE session_id = ?`, [sessionId],
  )?.lesson_json, null);
});

test("oversized output is aborted mid-stream instead of being stored", async () => {
  const sessionId = seedSession();
  script = [{ body: JSON.stringify({ pad: "y".repeat(20_000) }), finishReason: "stop" }];
  const res = await post(sessionId, "fundamentals");
  assert.equal(res.status, 502);
  assert.equal(calls, 1);
  assert.equal(db.queryOne<{ lesson_json: string | null }>(
    `SELECT lesson_json FROM learning_lessons WHERE session_id = ?`, [sessionId],
  )?.lesson_json, null);
});

test("the two modes of one topic are independent slots", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson("Fundamentals"), finishReason: "stop" }];
  await post(sessionId, "fundamentals");
  assert.equal(db.queryOne<{ status: string }>(
    `SELECT status FROM learning_lessons WHERE session_id = ? AND mode = 'answering'`, [sessionId],
  ), undefined);

  const catalog = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement&index=0`),
    { params: { id: sessionId } },
  );
  const modes = (await catalog.json() as { modes: Record<string, { status: string }> }).modes;
  assert.equal(modes.fundamentals.status, "ready");
  assert.equal(modes.answering.status, "uncreated");
});

test("a lesson from an older report revision is listed as history and flagged", async () => {
  const sessionId = seedSession();
  script = [{ body: validLesson(), finishReason: "stop" }];
  const created = await (await post(sessionId, "fundamentals")).json() as { id: string };

  db.exec(`UPDATE evaluations SET report_json = ? WHERE session_id = ?`,
    [JSON.stringify({ ...report, improvements: ["Brand new advice"] }), sessionId]);

  const catalog = await catalogRoute.GET(
    new Request(`http://localhost/api/sessions/${sessionId}/learning?kind=improvement&index=0`),
    { params: { id: sessionId } },
  );
  const body = await catalog.json() as {
    source: { label: string };
    modes: Record<string, { status: string; id?: string }>;
    older: { id: string; mode: string }[];
  };
  assert.equal(body.source.label, "Brand new advice");
  assert.equal(body.modes.fundamentals.status, "uncreated", "a new revision starts an empty slot");
  assert.equal(body.older.length, 1);
  assert.equal(body.older[0].id, created.id);

  const detail = await detailRoute.GET(new Request("http://localhost/api/learning/x"), {
    params: { lessonId: created.id },
  });
  const detailBody = await detail.json() as { lesson: { sessionId: string }; oldRevision: boolean };
  assert.equal(detailBody.oldRevision, true);
  assert.equal(detailBody.lesson.sessionId, sessionId);
});