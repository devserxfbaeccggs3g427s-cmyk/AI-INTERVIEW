/**
 * Opener topic memory — integration test for the messages route.
 *
 * The bug this locks down: every new interview opened on the same topic
 * (idempotency, every time) because nothing ever told the model which topics
 * earlier interviews had already covered. The route now reads those topics from
 * the finished evaluations and puts them in the opening prompt — and nowhere
 * else.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const origin = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const previousPrivate = process.env.ALLOW_PRIVATE_BASE_URL;
const previousEnabled = process.env.NEXT_PUBLIC_PROVIDER_ENABLE;

const dir = mkdtempSync(join(tmpdir(), "opener-topics-"));
process.env.INTERVIEW_DB_PATH = join(dir, "sessions.db");
process.env.PUBLIC_ORIGIN = origin;
process.env.ALLOW_PRIVATE_BASE_URL = "1";
// `custom` is not enabled by default and the registry reads this at module load.
process.env.NEXT_PUBLIC_PROVIDER_ENABLE = "custom";

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

let server: Server;
let baseUrl: string;
let db: typeof import("./db");
let messages: typeof import("../app/api/sessions/[id]/messages/route");

/** Every prompt the provider was asked to answer, in order. */
let prompts: string[] = [];

before(async () => {
  server = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions") { res.writeHead(404); res.end(); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw) as { messages: { role: string; content: string }[] };
    prompts.push(body.messages.map((message) => message.content).join("\n\n"));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Chào bạn, kể lại một sự cố thanh toán?" } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local mock port");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
  [db, messages] = await Promise.all([
    import("./db"),
    import("../app/api/sessions/[id]/messages/route"),
  ]);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.getDb().close();
  loader._load = originalLoad;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previousOrigin;
  if (previousPrivate === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previousPrivate;
  if (previousEnabled === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
  else process.env.NEXT_PUBLIC_PROVIDER_ENABLE = previousEnabled;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  prompts = [];
  db.exec("DELETE FROM evaluations");
  db.exec("DELETE FROM learning_lessons");
  db.exec("DELETE FROM sessions");
});

/** A report that satisfies EvaluationReportSchema exactly. */
function report(topic: string): string {
  const pillar = { score: 70, headline: "Rõ ràng", rationale: "Nêu đúng trade-off.", evidence_quote: "" };
  return JSON.stringify({
    schema_version: "v1",
    generated_at: "2026-10-22T00:00:00.000Z",
    overall_score: 70,
    recommendation: "Hire",
    pillars: { content: pillar, relevance: pillar, clarity: pillar, depth: pillar },
    strengths: ["Nêu đúng trade-off"],
    improvements: ["Cần đo độ trễ p99"],
    per_turn: [{
      turn_number: 1,
      topic,
      pillar_scores: { content: 70, relevance: 70, clarity: 70, depth: 70 },
      micro_rubric: { strengths: [], improvements: [] },
      standout_quote: "",
    }],
    next_steps: [
      { title: "Đọc sâu", description: "Ôn lại", duration: "2 hours" },
      { title: "Luyện tập", description: "Thiết kế lại", duration: "1 day" },
      { title: "Phản hồi", description: "Xem lại", duration: "30 minutes" },
    ],
    hiring_probability_pct: 60,
  });
}

function addSession(
  id: string,
  options: {
    status?: string;
    focus?: string[];
    originLessonId?: string;
    createdAt?: number;
    topic?: string;
  } = {},
): void {
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model,
       base_url, temperature, max_tokens, top_p, cv_source, focus_json, origin_lesson_id, created_at)
     VALUES (?, 'Backend Engineer', 'vi', 'strict', 8, ?, 'custom', 'local-model', ?, 0.4, 4096, 0.95,
       'none', ?, ?, ?)`,
    [
      id,
      options.status ?? "active",
      baseUrl,
      JSON.stringify(options.focus ?? []),
      options.originLessonId ?? null,
      options.createdAt ?? 1700000000,
    ],
  );
  if (options.topic === undefined) return;
  db.exec(
    `INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
     VALUES (?, ?, 70, 'Hire')`,
    [id, report(options.topic)],
  );
}

/** A lesson row so the FK on sessions.origin_lesson_id is satisfied. */
function addLesson(sessionId: string): string {
  const id = randomUUID();
  db.exec(
    `INSERT INTO learning_lessons (id, session_id, report_revision, source_kind, source_index, mode,
       source_label, status, claim_id, claimed_at, provider, model)
     VALUES (?, ?, ?, 'improvement', 0, 'fundamentals', 'Idempotency key', 'generating', ?, 1,
       'openai', 'test-model')`,
    [id, sessionId, "a".repeat(64), randomUUID()],
  );
  return id;
}

async function ask(sessionId: string, body: Record<string, unknown> = {}): Promise<string> {
  const response = await messages.POST(
    new Request(`${origin}/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        provider: "custom",
        model: "local-model",
        baseUrl,
        temperature: 0.4,
        maxTokens: 4096,
        topP: 0.95,
        answer: "",
        ...body,
      }),
    }),
    { params: { id: sessionId } },
  );
  assert.equal(response.status, 200, await response.clone().text());
  return response.text();
}

test("a new session opens on a topic the finished interviews did not cover", async () => {
  addSession("sess_old", { status: "completed", topic: "Idempotency key", createdAt: 1700000001 });
  addSession("sess_new");
  await ask("sess_new");
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes("Topics already covered in your previous interviews"));
  assert.ok(prompts[0].includes(JSON.stringify(["Idempotency key"])));
});

test("a session that practices a lesson keeps asking that lesson's topic", async () => {
  addSession("sess_old", { status: "completed", topic: "Idempotency key", createdAt: 1700000001 });
  const lessonId = addLesson("sess_old");
  addSession("sess_practice", { originLessonId: lessonId });
  await ask("sess_practice");
  assert.equal(prompts.length, 1);
  assert.ok(!prompts[0].includes("Topics already covered in your previous interviews"));
});

test("only the opening turn carries the covered topics", async () => {
  addSession("sess_old", { status: "completed", topic: "Idempotency key", createdAt: 1700000001 });
  addSession("sess_new");
  await ask("sess_new");
  await ask("sess_new", { answer: "Tôi dùng idempotency key kèm retry backoff." });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes("Topics already covered in your previous interviews") === false);
});

test("an explicit focus topic is not avoided", async () => {
  addSession("sess_old", { status: "completed", topic: "Idempotency key", createdAt: 1700000001 });
  addSession("sess_new", { focus: ["idempotency key"] });
  await ask("sess_new");
  assert.equal(prompts.length, 1);
  assert.ok(!prompts[0].includes("Topics already covered in your previous interviews"));
});

test("an unfinished session never feeds the topic memory", async () => {
  addSession("sess_running", { status: "active", topic: "Idempotency key", createdAt: 1700000001 });
  addSession("sess_new");
  await ask("sess_new");
  assert.equal(prompts.length, 1);
  assert.ok(!prompts[0].includes("Topics already covered in your previous interviews"));
});
