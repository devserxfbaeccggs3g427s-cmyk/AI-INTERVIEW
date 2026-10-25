/**
 * Cross-session topic memory (lib/recent-topics.ts).
 *
 * The bug this locks down: every new interview opened on the same topic
 * because the prompt only knew the role — there was no mechanism anywhere that
 * read the topics of earlier interviews. The helper now surfaces the topics of
 * the most recent finished interviews, while an explicit focus always wins.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const previousDb = process.env.INTERVIEW_DB_PATH;
const dir = mkdtempSync(join(tmpdir(), "recent-topics-"));
process.env.INTERVIEW_DB_PATH = join(dir, "sessions.db");

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

let db: typeof import("./db");
let recent: typeof import("./recent-topics");

before(async () => {
  [db, recent] = await Promise.all([import("./db"), import("./recent-topics")]);
});
after(() => {
  db.getDb().close();
  loader._load = originalLoad;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  db.exec("DELETE FROM evaluations");
  db.exec("DELETE FROM sessions");
});

/** A report that satisfies EvaluationReportSchema exactly. */
function report(topics: { turn: number; topic: string }[]): string {
  const pillar = { score: 70, headline: "Rõ ràng", rationale: "Nêu đúng trade-off.", evidence_quote: "" };
  return JSON.stringify({
    schema_version: "v1",
    generated_at: "2026-10-22T00:00:00.000Z",
    overall_score: 70,
    recommendation: "Hire",
    pillars: { content: pillar, relevance: pillar, clarity: pillar, depth: pillar },
    strengths: ["Nêu đúng trade-off"],
    improvements: ["Cần đo độ trễ p99"],
    per_turn: topics.map(({ turn, topic }) => ({
      turn_number: turn,
      topic,
      pillar_scores: { content: 70, relevance: 70, clarity: 70, depth: 70 },
      micro_rubric: { strengths: [], improvements: [] },
      standout_quote: "",
    })),
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
    createdAt?: number;
    topics?: { turn: number; topic: string }[];
    raw?: string;
  } = {},
): void {
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model, created_at)
     VALUES (?, 'Backend', 'vi', 'strict', 8, ?, 'openai', 'test-model', ?)`,
    [id, options.status ?? "completed", options.createdAt ?? 1700000000],
  );
  const body = options.raw ?? (options.topics ? report(options.topics) : undefined);
  if (body === undefined) return;
  db.exec(
    `INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
     VALUES (?, ?, 70, 'Hire')`,
    [id, body],
  );
}

test("only finished interviews feed the topic memory", () => {
  addSession("sess_active", { status: "active", topics: [{ turn: 1, topic: "Idempotency key" }] });
  addSession("sess_failed", { status: "failed", topics: [{ turn: 1, topic: "Redis Streams" }] });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_new" }), []);
});

test("the opening topic is listed first even when the report stores it last", () => {
  addSession("sess_old", {
    topics: [{ turn: 2, topic: "Redis Streams" }, { turn: 1, topic: "Idempotency key" }],
  });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_new" }), [
    "Idempotency key",
    "Redis Streams",
  ]);
});

test("a broken or schema-invalid report is skipped instead of breaking the new session", () => {
  addSession("sess_broken", { raw: "{not json" });
  addSession("sess_invalid", { raw: JSON.stringify({ schema_version: "v1" }) });
  addSession("sess_ok", { topics: [{ turn: 1, topic: "Kafka rebalance" }] });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_new" }), ["Kafka rebalance"]);
});

test("the session being started never feeds its own topic memory", () => {
  addSession("sess_self", { topics: [{ turn: 1, topic: "Idempotency key" }] });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_self" }), []);
});

test("the same topic in two interviews is listed once, keeping the newest wording", () => {
  addSession("sess_a", { topics: [{ turn: 1, topic: "Idempotency key" }], createdAt: 1700000001 });
  addSession("sess_b", { topics: [{ turn: 1, topic: "idempotency KEY" }], createdAt: 1700000002 });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_new" }), ["idempotency KEY"]);
});

test("report prose is reduced to a plain label before it reaches a prompt", () => {
  addSession("sess_a", { topics: [{ turn: 1, topic: "  <b>Index</b> https://example.test/doc `plans`  " }] });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_new" }), ["Index plans"]);
});

test("an explicit focus topic is never avoided", () => {
  addSession("sess_a", {
    topics: [
      { turn: 1, topic: "Ôn idempotency key và UNIQUE constraint" },
      { turn: 2, topic: "Redis connection pool" },
    ],
  });
  assert.deepEqual(
    recent.recentCoveredTopics({ excludeSessionId: "sess_new", focus: ["idempotency key"] }),
    ["Redis connection pool"],
  );
});

test("a short focus label still wins over a covered topic", () => {
  addSession("sess_a", {
    topics: [{ turn: 1, topic: "AI model serving" }, { turn: 2, topic: "Kafka rebalance" }],
  });
  assert.deepEqual(
    recent.recentCoveredTopics({ excludeSessionId: "sess_new", focus: ["AI"] }),
    ["Kafka rebalance"],
  );
});

test("topic count and total length are capped", () => {
  addSession("sess_a", {
    topics: [
      { turn: 1, topic: "Idempotency key" },
      { turn: 2, topic: "Redis connection pool" },
      { turn: 3, topic: "Kafka rebalance" },
    ],
  });
  assert.deepEqual(
    recent.recentCoveredTopics({ excludeSessionId: "sess_new", maxTopics: 2 }),
    ["Idempotency key", "Redis connection pool"],
  );
  assert.deepEqual(
    recent.recentCoveredTopics({ excludeSessionId: "sess_new", maxChars: 20 }),
    ["Idempotency key"],
  );
});

test("only the most recent interviews are read", () => {
  addSession("sess_old", { topics: [{ turn: 1, topic: "Idempotency key" }], createdAt: 1700000001 });
  addSession("sess_newer", { topics: [{ turn: 1, topic: "Redis Streams" }], createdAt: 1700000002 });
  assert.deepEqual(recent.recentCoveredTopics({ excludeSessionId: "sess_x", maxSessions: 1 }), [
    "Redis Streams",
  ]);
  assert.deepEqual(
    recent.recentCoveredTopics({ excludeSessionId: "sess_x", maxSessions: 4 }).sort(),
    ["Idempotency key", "Redis Streams"].sort(),
  );
});
