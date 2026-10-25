/**
 * Regression tests for the final-evaluation loop (FR-17).
 *
 * What these lock down: the report used to be generated with the *session's*
 * 4096-token ceiling. A long Vietnamese transcript produces a report far
 * larger than that, so the provider cut the JSON off mid-object — and because
 * `finish_reason` was never read, truncation surfaced as the generic
 * "Invalid evaluation response", forcing the user to click "chấm điểm lại"
 * until a sample happened to be short enough to fit.
 *
 * The fix is three-part and each part is asserted here: the report gets its own
 * output budget, a truncated body escalates to a larger one instead of failing,
 * and every round-trip lands in `evaluation_attempts` so the next failure is
 * diagnosable rather than guessed at.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

import {
  EVALUATION_MAX_TOKENS,
  EVALUATION_RETRY_MAX_TOKENS,
} from "./evaluation-constants";

let server: Server;
let baseUrl: string;
let tmpDir: string;
const previousPrivate = process.env.ALLOW_PRIVATE_BASE_URL;
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousEnabled = process.env.NEXT_PUBLIC_PROVIDER_ENABLE;

interface Scripted { body: string; finishReason: string }
/** Consumed in order — one entry per provider round-trip. */
let script: Scripted[] = [];
let requestedMaxTokens: number[] = [];
let requestedPrompts: string[] = [];

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "eval-test-"));
  process.env.INTERVIEW_DB_PATH = join(tmpDir, "test.db");
  process.env.ALLOW_PRIVATE_BASE_URL = "1";
  // `custom` is not enabled by default; the registry reads this at module load,
  // so it has to be set before the first import of ./evaluation below.
  process.env.NEXT_PUBLIC_PROVIDER_ENABLE = "custom";

  server = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions") { res.writeHead(404); res.end(); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw) as { max_tokens?: number; messages?: { content: string }[] };
    const maxTokens = request.max_tokens ?? -1;
    requestedMaxTokens.push(maxTokens);
    requestedPrompts.push(request.messages?.map((message) => message.content).join("\n\n") ?? "");

    const next = script.shift() ?? { body: "{}", finishReason: "stop" };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: next.body } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: next.finishReason }],
      usage: { prompt_tokens: 900, completion_tokens: maxTokens },
    })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local mock port");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

beforeEach(() => {
  script = [];
  requestedMaxTokens = [];
  requestedPrompts = [];
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
  if (previousPrivate === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previousPrivate;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  if (previousEnabled === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
  else process.env.NEXT_PUBLIC_PROVIDER_ENABLE = previousEnabled;
});

/** A report that satisfies EvaluationReportSchema exactly. */
function validReport(): string {
  const pillar = (score: number) => ({
    score, headline: "Rõ ràng", rationale: "Ứng viên nêu đúng trade-off.", evidence_quote: "idempotency",
  });
  return JSON.stringify({
    schema_version: "v1",
    overall_score: 72,
    recommendation: "Hire",
    pillars: {
      content: pillar(70), relevance: pillar(75), clarity: pillar(68), depth: pillar(74),
    },
    strengths: ["Nêu đúng idempotency key"],
    improvements: ["Nên đo độ trễ p99"],
    per_turn: [{
      turn_number: 1,
      topic: "Retry khi timeout",
      pillar_scores: { content: 70, relevance: 75, clarity: 68, depth: 74 },
      micro_rubric: { score: 70, strengths: ["Rõ"], improvements: ["Thiếu số liệu"] },
      standout_quote: "idempotency",
    }],
    next_steps: [
      { title: "Đọc sâu", description: "Ôn lại tránh kịch bản timeout.", duration: "2 hours" },
      { title: "Luyện tập", description: "Thiết kế lại luồng thanh toán.", duration: "1 day" },
      { title: "Phản hồi", description: "Xem lại bài ghi âm.", duration: "30 minutes" },
    ],
    hiring_probability_pct: 65,
  });
}

/** Cut off mid-object, exactly what a `finish_reason: length` body looks like. */
function truncatedReport(): string {
  return validReport().slice(0, 400);
}

type EvalModule = typeof import("./evaluation");
type DbModule = typeof import("./db");

async function seed(id: string): Promise<{ db: DbModule; evaluation: EvalModule }> {
  // Imported lazily so INTERVIEW_DB_PATH above is set before db.ts resolves it.
  const db = await import("./db");
  const evaluation = await import("./evaluation");
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model,
       base_url, temperature, max_tokens, top_p, cv_source)
     VALUES (?, 'Backend', 'vi', 'strict', 8, 'active', 'custom', 'local-model', ?, 0.4, 4096, 0.95, 'none')`,
    [id, baseUrl],
  );
  db.exec(
    `INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, 1, 'assistant', 'Kể lại một lần payment bị timeout?')`,
    [id],
  );
  db.exec(
    `INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, 1, 'user', 'Tôi dùng idempotency key và retry backoff.')`,
    [id],
  );
  return { db, evaluation };
}

const CONFIG = { provider: "custom", model: "local-model" } as const;

function attemptsFor(db: DbModule, sessionId: string) {
  return db.query<{
    outcome: string; max_tokens: number; finish_reason: string | null;
    response_chars: number; raw_response: string | null; error_message: string | null;
  }>(
    `SELECT outcome, max_tokens, finish_reason, response_chars, raw_response, error_message
     FROM evaluation_attempts WHERE session_id = ? ORDER BY id ASC`,
    [sessionId],
  );
}

test("the report no longer inherits the session's 4096-token ceiling", async () => {
  const { db, evaluation } = await seed("sess_budget");
  script = [{ body: validReport(), finishReason: "stop" }];

  const attemptId = evaluation.claimEvaluation("sess_budget");
  assert.ok(attemptId);
  await evaluation.runEvaluation({ sessionId: "sess_budget", baseUrl, ...CONFIG }, attemptId);

  assert.deepEqual(requestedMaxTokens, [EVALUATION_MAX_TOKENS]);
  assert.ok(EVALUATION_MAX_TOKENS > 4096, "budget must exceed the old hard-coded ceiling");
  assert.equal(db.queryOne<{ status: string }>("SELECT status FROM sessions WHERE id = ?", ["sess_budget"])?.status, "completed");
});

test("early stop evaluates only turns the candidate actually answered", async () => {
  const { db, evaluation } = await seed("sess_unanswered");
  db.exec(
    `INSERT INTO message_turns (session_id, turn_number, role, content)
     VALUES (?, 2, 'assistant', 'Bạn sẽ debug deadlock thế nào?')`,
    ["sess_unanswered"],
  );
  script = [{ body: validReport(), finishReason: "stop" }];

  const attemptId = evaluation.claimEvaluation("sess_unanswered");
  assert.ok(attemptId);
  await evaluation.runEvaluation({ sessionId: "sess_unanswered", baseUrl, ...CONFIG }, attemptId);

  assert.equal(db.queryOne<{ status: string }>("SELECT status FROM sessions WHERE id = ?", ["sess_unanswered"])?.status, "completed");
  assert.ok(requestedPrompts[0].includes("Kể lại một lần payment bị timeout?"));
  assert.ok(requestedPrompts[0].includes("Tôi dùng idempotency key và retry backoff."));
  assert.ok(!requestedPrompts[0].includes("Bạn sẽ debug deadlock thế nào?"));
  assert.ok(!requestedPrompts[0].includes("--- Turn 2 ---"));
});

test("a truncated body escalates to a larger budget instead of failing", async () => {
  const { db, evaluation } = await seed("sess_escalate");
  script = [
    { body: truncatedReport(), finishReason: "length" },
    { body: validReport(), finishReason: "stop" },
  ];

  const attemptId = evaluation.claimEvaluation("sess_escalate");
  assert.ok(attemptId);
  await evaluation.runEvaluation({ sessionId: "sess_escalate", baseUrl, ...CONFIG }, attemptId);

  assert.deepEqual(requestedMaxTokens, [EVALUATION_MAX_TOKENS, EVALUATION_RETRY_MAX_TOKENS]);

  const rows = attemptsFor(db, "sess_escalate");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outcome, "failed");
  assert.equal(rows[0].finish_reason, "length");
  assert.equal(rows[0].max_tokens, EVALUATION_MAX_TOKENS);
  assert.match(rows[0].error_message ?? "", /length/);
  assert.equal(rows[1].outcome, "completed");
  assert.equal(rows[1].finish_reason, "stop");
  assert.equal(rows[1].max_tokens, EVALUATION_RETRY_MAX_TOKENS);

  // Both round-trips belong to the one claim.
  assert.equal(db.queryOne<{ n: number }>(
    "SELECT COUNT(DISTINCT attempt_id) n FROM evaluation_attempts WHERE session_id = ?", ["sess_escalate"])?.n, 1);

  const stored = db.queryOne<{ overall_score: number }>(
    "SELECT overall_score FROM evaluations WHERE session_id = ?", ["sess_escalate"]);
  assert.equal(stored?.overall_score, 72);
});

test("Anthropic's max_tokens stop reason is also read as truncation", async () => {
  const { db, evaluation } = await seed("sess_anthropic_reason");
  script = [
    { body: truncatedReport(), finishReason: "max_tokens" },
    { body: validReport(), finishReason: "end_turn" },
  ];

  const attemptId = evaluation.claimEvaluation("sess_anthropic_reason");
  assert.ok(attemptId);
  await evaluation.runEvaluation({ sessionId: "sess_anthropic_reason", baseUrl, ...CONFIG }, attemptId);

  assert.deepEqual(requestedMaxTokens, [EVALUATION_MAX_TOKENS, EVALUATION_RETRY_MAX_TOKENS]);
  assert.match(attemptsFor(db, "sess_anthropic_reason")[0].error_message ?? "", /length/);
});

test("a schema mismatch is retried once and the raw body is kept for diagnosis", async () => {
  const { db, evaluation } = await seed("sess_schema");
  // Parses as JSON but has no pillars — a Zod failure, not a truncation.
  script = [
    { body: JSON.stringify({ schema_version: "v1", overall_score: 70 }), finishReason: "stop" },
    { body: validReport(), finishReason: "stop" },
  ];

  const attemptId = evaluation.claimEvaluation("sess_schema");
  assert.ok(attemptId);
  await evaluation.runEvaluation({ sessionId: "sess_schema", baseUrl, ...CONFIG }, attemptId);

  const rows = attemptsFor(db, "sess_schema");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outcome, "failed");
  assert.match(rows[0].error_message ?? "", /schema/);
  // The raw body is what makes this diagnosable instead of a guessing game.
  assert.match(rows[0].raw_response ?? "", /"overall_score":70/);
  assert.equal(rows[1].outcome, "completed");
});

test("truncating at both budgets fails the session and says why", async () => {
  const { db, evaluation } = await seed("sess_both_fail");
  script = [
    { body: truncatedReport(), finishReason: "length" },
    { body: truncatedReport(), finishReason: "length" },
  ];

  const attemptId = evaluation.claimEvaluation("sess_both_fail");
  assert.ok(attemptId);
  await assert.rejects(
    () => evaluation.runEvaluation({ sessionId: "sess_both_fail", baseUrl, ...CONFIG }, attemptId),
    /incomplete/,
  );

  // Bounded at two round-trips — a pathological provider cannot loop.
  assert.equal(requestedMaxTokens.length, 2);
  assert.equal(attemptsFor(db, "sess_both_fail").length, 2);
  const session = db.queryOne<{ status: string; error_count: number }>(
    "SELECT status, error_count FROM sessions WHERE id = ?", ["sess_both_fail"]);
  assert.equal(session?.status, "failed");
  assert.equal(session?.error_count, 1);
});

test("a stale claim cannot be overwritten by a second evaluation", async () => {
  const { db, evaluation } = await seed("sess_claim");
  const stale = evaluation.claimEvaluation("sess_claim");
  assert.ok(stale);
  // Another tab tries to claim before the stale window opens.
  assert.equal(evaluation.claimEvaluation("sess_claim", true), null);

  script = [{ body: validReport(), finishReason: "stop" }];
  await evaluation.runEvaluation({ sessionId: "sess_claim", baseUrl, ...CONFIG }, stale);
  assert.equal(db.queryOne<{ status: string }>("SELECT status FROM sessions WHERE id = ?", ["sess_claim"])?.status, "completed");
  // A completed session is terminal — no further retry can hijack it.
  assert.equal(evaluation.claimEvaluation("sess_claim", true), null);
});
