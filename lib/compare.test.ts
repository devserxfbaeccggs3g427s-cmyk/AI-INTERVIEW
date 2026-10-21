import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

// db.ts captures this path at import time. Never use the real data/ database.
const oldDbPath = process.env.INTERVIEW_DB_PATH;
const dir = mkdtempSync(join(tmpdir(), "compare-"));
process.env.INTERVIEW_DB_PATH = join(dir, "compare.db");

type Db = typeof import("./db");
type Compare = typeof import("./compare");
type Route = typeof import("../app/api/compare/route");
let db: Db;
let compare: Compare;
let route: Route;

before(async () => {
  [db, compare, route] = await Promise.all([import("./db"), import("./compare"), import("../app/api/compare/route")]);
});

after(() => {
  if (oldDbPath === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = oldDbPath;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM sessions");
});

function report(overall: number, pillars = [0, 100, 20, 80]): string {
  const pillar = (score: number) => ({ score, headline: "Headline", rationale: "Rationale", evidence_quote: "secret quote" });
  return JSON.stringify({
    schema_version: "v1", generated_at: "2025-01-01T00:00:00.000Z", overall_score: overall,
    recommendation: "Hire",
    pillars: { content: pillar(pillars[0]), relevance: pillar(pillars[1]), clarity: pillar(pillars[2]), depth: pillar(pillars[3]) },
    strengths: ["secret strength"], improvements: ["secret improvement"],
    per_turn: [{ turn_number: 1, topic: "secret topic", pillar_scores: { content: 0, relevance: 100, clarity: 20, depth: 80 },
      micro_rubric: { strengths: [], improvements: [] }, standout_quote: "secret transcript" }],
    next_steps: [1, 2, 3].map((i) => ({ title: `secret ${i}`, description: "secret description", duration: "one week" })),
  });
}

function seed(id: string, opts: {
  role?: string; status?: string; provider?: string; model?: string; rounds?: number;
  json?: string | null; answers?: number; overall?: number;
} = {}) {
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model, created_at, ended_at)
     VALUES (?, ?, 'vi', 'strict', ?, ?, ?, ?, 1700000000, 1700000100)`,
    [id, opts.role ?? "Engineer", opts.rounds ?? 5, opts.status ?? "completed", opts.provider ?? "openai", opts.model ?? "model-a"],
  );
  for (let i = 1; i <= (opts.answers ?? 1); i++) {
    db.exec("INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, ?, 'user', ?)", [id, i, "secret answer"]);
  }
  if (opts.json !== null) {
    db.exec("INSERT INTO evaluations (session_id, report_json, overall_score, recommendation) VALUES (?, ?, ?, 'Hire')",
      [id, opts.json ?? report(opts.overall ?? 50), opts.overall ?? 50]);
  }
}

const get = async (params: string) => route.GET(new Request(`http://localhost/api/compare?${params}`));

test("compares normalized roles across saved sessions, preserving zero and 100", async () => {
  seed("sess_A", { role: "  Senior   Engineer ", json: report(0), answers: 1 });
  seed("sess_B", { role: "senior engineer", json: report(100, [100, 0, 100, 0]), answers: 3, provider: "anthropic", model: "model-b" });
  const res = await get("a=sess_A&b=sess_B");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const json = await res.json();
  assert.deepEqual(Object.keys(json).sort(), ["a", "b", "ok", "warnings"]);
  assert.equal(json.a.overall_score, 0);
  assert.deepEqual(json.a.pillars, { content: 0, relevance: 100, clarity: 20, depth: 80 });
  assert.equal(json.b.overall_score, 100);
  assert.equal(json.a.answered_turns, 1);
  assert.equal(json.b.answered_turns, 3);
  assert.equal(json.warnings.length, 3);
  assert.equal(json.a.planned_rounds, 5);
  const serialized = JSON.stringify(json);
  for (const secret of ["secret quote", "secret answer", "secret strength", "secret transcript", "report_json", "api_key", "cv_"]) {
    assert.ok(!serialized.includes(secret), `must not include ${secret}`);
  }
});

test("role normalization is locale-independent for client and server pairing", () => {
  assert.equal(compare.normalizeCompareRole(" SENIOR   Engineer "), "senior engineer");
  assert.equal(compare.normalizeCompareRole("Senior Engineer"), "senior engineer");
  assert.equal(compare.normalizeCompareRole("SENIOR"), "senior");
});

test("validates two distinct well-formed IDs before database access", async () => {
  for (const params of ["", "a=sess_A", "a=sess_A&b=sess_A", "a=bad%20id&b=sess_B", "a=sess_A&a=sess_B&b=sess_C"]) {
    const res = await get(params);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).ok, false);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  }
});

test("rejects absent, unfinished, missing-report, invalid-report, or different-role sessions explicitly", async () => {
  seed("sess_A");
  seed("sess_active", { status: "active" });
  seed("sess_missing", { json: null });
  seed("sess_invalid", { json: '{"overall_score": 50}' });
  seed("sess_other", { role: "Designer" });
  for (const [id, status, message] of [
    ["sess_absent", 404, "Không tìm thấy"],
    ["sess_active", 409, "chưa hoàn tất"],
    ["sess_missing", 409, "chưa có báo cáo"],
    ["sess_invalid", 422, "không hợp lệ"],
    ["sess_other", 422, "cùng vị trí"],
  ] as const) {
    const res = await get(`a=sess_A&b=${id}`);
    assert.equal(res.status, status);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["error", "ok"]);
    assert.match(body.error, new RegExp(message));
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  }
});

test("warns when planned rounds differ even with the same number of answers", () => {
  seed("sess_A", { rounds: 5, answers: 1 });
  seed("sess_B", { rounds: 12, answers: 1 });
  const result = compare.compareSessions("sess_A", "sess_B");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.b.planned_rounds, 12);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Số vòng dự kiến khác nhau/);
  }
});

test("does not rely on nullable summary score from evaluations table", () => {
  seed("sess_A", { overall: 72, json: report(0) });
  seed("sess_B", { overall: 4, json: report(100) });
  const result = compare.compareSessions("sess_A", "sess_B");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.a.overall_score, 0);
    assert.equal(result.b.overall_score, 100);
    assert.deepEqual(result.warnings, []);
  }
});
