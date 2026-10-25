import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const origin = "https://interview.example.com";
const dir = mkdtempSync(join(tmpdir(), "question-generation-"));
const previous = {
  db: process.env.INTERVIEW_DB_PATH,
  origin: process.env.PUBLIC_ORIGIN,
  private: process.env.ALLOW_PRIVATE_BASE_URL,
  providers: process.env.NEXT_PUBLIC_PROVIDER_ENABLE,
};
process.env.INTERVIEW_DB_PATH = join(dir, "test.db");
process.env.PUBLIC_ORIGIN = origin;
process.env.ALLOW_PRIVATE_BASE_URL = "1";
process.env.NEXT_PUBLIC_PROVIDER_ENABLE = "custom";

const loader = Module as unknown as { _load: (id: string, parent: unknown, isMain?: boolean) => unknown };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

interface Answer { text: string; finish?: string; status?: number }
let answers: Answer[] = [];
let prompts: string[] = [];
let server: Server;
let baseUrl: string;
let db: typeof import("./db");
let messages: typeof import("../app/api/sessions/[id]/messages/route");

before(async () => {
  server = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions") { res.writeHead(404); res.end(); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw) as { messages: { content: string }[] };
    prompts.push(body.messages.map((m) => m.content).join("\n\n"));
    const next = answers.shift() ?? { text: "Bạn sẽ xử lý retry thế nào?" };
    if (next.status) { res.writeHead(next.status); res.end("Mock provider failed"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const middle = Math.ceil(next.text.length / 2);
    for (const text of [next.text.slice(0, middle), next.text.slice(middle)]) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: next.finish ?? "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No mock port");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
  [db, messages] = await Promise.all([import("./db"), import("../app/api/sessions/[id]/messages/route")]);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.getDb().close();
  loader._load = originalLoad;
  if (previous.db === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previous.db;
  if (previous.origin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previous.origin;
  if (previous.private === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previous.private;
  if (previous.providers === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
  else process.env.NEXT_PUBLIC_PROVIDER_ENABLE = previous.providers;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  answers = [];
  prompts = [];
  db.exec("DELETE FROM sessions");
});

function seed(id: string, mode: "strict" | "coaching" = "strict") {
  db.exec(
    `INSERT INTO sessions (id, role, language, mode, planned_rounds, status, provider, model,
      base_url, temperature, max_tokens, top_p, cv_source)
     VALUES (?, 'Backend Engineer', 'vi', ?, 5, 'active', 'custom', 'local-model', ?, 0.4, 4096, 0.95, 'none')`,
    [id, mode, baseUrl],
  );
}

async function ask(id: string, answer = "", earlyStop = false) {
  const res = await messages.POST(new Request(`${origin}/api/sessions/${id}/messages`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ provider: "custom", model: "local-model", baseUrl, temperature: 0.4,
      maxTokens: 4096, topP: 0.95, answer, earlyStop }),
  }), { params: { id } });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.text()).split("\n\n").filter(Boolean).map((frame) => JSON.parse(frame.slice(6)) as {
    type: string; text?: string; message?: string; reason?: string; turn?: number;
  });
}

function turns(id: string) {
  return db.query<{ role: string; content: string; finish_reason: string | null }>(
    "SELECT role, content, finish_reason FROM message_turns WHERE session_id = ? ORDER BY turn_number, id", [id],
  );
}

test("accepted opener emits only the canonical question and persists the same text", async () => {
  seed("sess_valid");
  answers = [{ text: "Chào bạn. Bạn thiết kế endpoint tránh tạo đơn trùng thế nào?" }];
  const events = await ask("sess_valid");
  const delta = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
  assert.equal(delta, "Chào bạn. Bạn thiết kế endpoint tránh tạo đơn trùng thế nào?");
  assert.equal(turns("sess_valid").find((t) => t.role === "assistant")?.content, delta);
  assert.equal(events.at(-1)?.type, "done");
});

test("invalid opener retries once and never streams its fabricated answer", async () => {
  seed("sess_retry");
  answers = [
    { text: "Bạn xử lý retry thế nào?\nỨng viên: Tôi dùng UNIQUE key.\nĐiểm: 5/100" },
    { text: "Thiết kế API đặt hàng khi client retry đồng thời." },
  ];
  const events = await ask("sess_retry");
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes("Return exactly one interviewer question"));
  assert.ok(!prompts[1].includes("Tôi dùng UNIQUE key"));
  assert.deepEqual(events.filter((e) => e.type === "delta").map((e) => e.text), ["Thiết kế API đặt hàng khi client retry đồng thời."]);
  assert.equal(turns("sess_retry").find((t) => t.role === "assistant")?.content, "Thiết kế API đặt hàng khi client retry đồng thời.");
});

test("two invalid responses leave no phantom question and allow retry", async () => {
  seed("sess_invalid");
  answers = [{ text: "Chào bạn." }, { text: "✓ Điểm tốt: 5/100" }];
  const events = await ask("sess_invalid");
  assert.deepEqual(events.map((e) => e.type), ["start", "error"]);
  assert.equal(turns("sess_invalid").length, 0);
  assert.deepEqual((await ask("sess_invalid")).map((e) => e.type), ["start", "delta", "persisted", "done"]);
});

test("truncated or oversized output is retried, not saved as a question", async () => {
  seed("sess_cutoff");
  answers = [{ text: "Bạn xử lý retry thế nào?", finish: "length" }, { text: "Viết pseudo code cho bộ giới hạn tốc độ." }];
  const events = await ask("sess_cutoff");
  assert.equal(events.find((e) => e.type === "delta")?.text, "Viết pseudo code cho bộ giới hạn tốc độ.");
  assert.equal(turns("sess_cutoff").find((t) => t.role === "assistant")?.finish_reason, "stop");
  seed("sess_oversized");
  answers = [{ text: "Hãy " + "a".repeat(5000) }, { text: "Chào bạn." }];
  const failed = await ask("sess_oversized");
  assert.deepEqual(failed.map((e) => e.type), ["start", "error"]);
  assert.equal(turns("sess_oversized").length, 0);
});

test("transport errors do not retry or commit a candidate answer", async () => {
  seed("sess_network");
  answers = [{ text: "Bạn xử lý retry thế nào?" }];
  await ask("sess_network");
  answers = [{ text: "", status: 503 }];
  const events = await ask("sess_network", "Tôi dùng UNIQUE key.");
  assert.deepEqual(events.map((e) => e.type), ["start", "error"]);
  assert.equal(prompts.length, 2);
  assert.equal(turns("sess_network").filter((t) => t.role === "user").length, 0);
  assert.equal(turns("sess_network").filter((t) => t.role === "assistant").length, 1);
});

test("coaching question strips old inline feedback before persistence", async () => {
  seed("sess_coaching", "coaching");
  answers = [{ text: "Bạn xử lý retry thế nào?" }];
  await ask("sess_coaching");
  answers = [
    { text: "✓ Điểm tốt: Bạn nêu đúng nguyên nhân.\n! Gợi ý cải thiện: Nêu thêm trade-off.\nĐiểm: 5/100\n\nBạn đặt UNIQUE constraint ở đâu?" },
    { text: '{"score":70,"strengths":["Rõ"],"improvements":["Thiếu số liệu"]}' },
  ];
  const events = await ask("sess_coaching", "Tôi sẽ thêm idempotency key.");
  assert.equal(events.find((e) => e.type === "delta")?.text, "Bạn đặt UNIQUE constraint ở đâu?");
  assert.equal(turns("sess_coaching").filter((t) => t.role === "assistant")[1]?.content, "Bạn đặt UNIQUE constraint ở đâu?");
  assert.equal(events.filter((e) => e.type === "coaching").length, 1);
  assert.ok(!prompts[0].includes("give a 2-bullet micro-rubric"));
});

test("coaching appears after each answer and is persisted on the answered question", async () => {
  seed("sess_feedback", "coaching");
  await ask("sess_feedback");
  answers = [
    { text: "Bạn xử lý cạnh tranh ghi dữ liệu thế nào?" },
    { text: 'Kết quả:\n```json\n{"score":78,"strengths":["Đề cập UNIQUE key"],"improvements":["Bổ sung race condition"]}\n```' },
  ];
  const events = await ask("sess_feedback", "Tôi thêm UNIQUE key.");
  assert.deepEqual(events.map((e) => e.type), ["start", "delta", "coaching", "persisted", "done"]);
  assert.equal(events.find((e) => e.type === "coaching")?.turn, 1);
  assert.ok(prompts[1].includes("Bạn sẽ xử lý retry thế nào?"));
  const saved = db.queryOne<{ micro_rubric: string | null }>(
    "SELECT micro_rubric FROM message_turns WHERE session_id = ? AND role = 'assistant' AND turn_number = 1", ["sess_feedback"],
  );
  assert.equal(JSON.parse(saved?.micro_rubric ?? "null").score, 78);
});

test("malformed or failed coaching reports a nonfatal notice and still saves the answer", async () => {
  seed("sess_no_feedback", "coaching");
  await ask("sess_no_feedback");
  answers = [{ text: "Bạn thiết kế retry thế nào?" }, { text: '{"score":70,"strengths":["Rõ"],"improvements":["Thêm ví dụ"]}', finish: "length" }];
  const events = await ask("sess_no_feedback", "Tôi dùng UNIQUE key.");
  assert.deepEqual(events.map((e) => e.type), ["start", "delta", "coaching_unavailable", "persisted", "done"]);
  assert.equal(events.find((e) => e.type === "coaching_unavailable")?.turn, 1);
  assert.match(events.find((e) => e.type === "coaching_unavailable")?.message ?? "", /góp ý/);
  assert.equal(turns("sess_no_feedback").filter((t) => t.role === "user").length, 1);
  assert.equal(db.queryOne<{ micro_rubric: string | null }>(
    "SELECT micro_rubric FROM message_turns WHERE session_id = ? AND role = 'assistant' AND turn_number = 1", ["sess_no_feedback"],
  )?.micro_rubric, null);
  answers = [{ text: "Bạn xử lý transaction ra sao?" }, { text: "", status: 503 }];
  const failed = await ask("sess_no_feedback", "Tôi dùng transaction.");
  assert.deepEqual(failed.map((e) => e.type), ["start", "delta", "coaching_unavailable", "persisted", "done"]);
  assert.equal(failed.find((e) => e.type === "coaching_unavailable")?.turn, 2);
});

test("final answered turn receives coaching; early stop without a new answer does not", async () => {
  seed("sess_final_feedback", "coaching");
  await ask("sess_final_feedback");
  answers = [
    { text: '{"score":80,"strengths":["Rõ ràng"],"improvements":["Thêm ví dụ"]}' },
    { text: "{}" }, { text: "{}" },
  ];
  const final = await ask("sess_final_feedback", "Tôi dùng UNIQUE key.", true);
  assert.deepEqual(final.slice(0, 3).map((e) => e.type), ["start", "coaching", "persisted"]);
  assert.equal(final.find((e) => e.type === "coaching")?.turn, 1);
  assert.equal(turns("sess_final_feedback").filter((t) => t.role === "user").length, 1);
  assert.equal(JSON.parse(db.queryOne<{ micro_rubric: string }>(
    "SELECT micro_rubric FROM message_turns WHERE session_id = ? AND role = 'assistant' AND turn_number = 1", ["sess_final_feedback"],
  )!.micro_rubric).score, 80);

  seed("sess_stop_without_answer", "coaching");
  await ask("sess_stop_without_answer");
  answers = [{ text: "Bạn tối ưu truy vấn thế nào?" }, { text: '{"score":70,"strengths":["Rõ"],"improvements":["Ví dụ"]}' }];
  await ask("sess_stop_without_answer", "Tôi thêm index.");
  answers = [{ text: "{}" }, { text: "{}" }];
  const stopped = await ask("sess_stop_without_answer", "", true);
  assert.ok(!stopped.some((e) => e.type === "coaching" || e.type === "coaching_unavailable"));
  assert.equal(turns("sess_stop_without_answer").filter((t) => t.role === "user").length, 1);
});
