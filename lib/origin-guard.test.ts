import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { PRIVATE_HEADERS, parsePublicOrigin, privateJson, rejectCrossOrigin } from "./origin-guard";

const PUBLIC = "https://interview.example.com";

function request(origin: string | null, extraHeaders: Record<string, string> = {}): Request {
  return new Request("http://internal-service:3000/api/sessions", {
    method: "POST",
    headers: { ...(origin === null ? {} : { origin }), ...extraHeaders },
  });
}

function assertPrivate(response: Response): void {
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
    assert.equal(response.headers.get(key), value, key);
  }
}

test("parsePublicOrigin requires an explicit origin and fails closed for malformed config", () => {
  for (const value of [
    undefined, "", " ", "null", "interview.example.com", "//interview.example.com",
    "ftp://interview.example.com", "https://", "https://interview.example.com:invalid",
    "https://interview.example.com,https://evil.example", "https://interview.example.com ",
    " https://interview.example.com", "https://interview.example.com/",
    "https://interview.example.com/path", "https://interview.example.com?x=1",
    "https://interview.example.com#fragment", "https://user:pass@interview.example.com",
    "https://interview.example.com:443", "https://INTERVIEW.example.com",
    "https://interview.example.com\nhttps://evil.example",
  ]) {
    assert.equal(parsePublicOrigin(value, "production"), null, `must reject ${JSON.stringify(value)}`);
  }
});

test("parsePublicOrigin accepts exact HTTPS origins in production, preserving nondefault ports", () => {
  for (const value of [PUBLIC, "https://interview.example.com:8443", "https://localhost:3000", "https://[::1]:3000"]) {
    assert.equal(parsePublicOrigin(value, "production"), value);
  }
});

test("parsePublicOrigin permits explicit HTTP loopback only outside production", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const origin = `http://${host}:3000`;
    assert.equal(parsePublicOrigin(origin, "development"), origin);
    assert.equal(parsePublicOrigin(origin, "test"), origin);
    assert.equal(parsePublicOrigin(origin, "production"), null);
  }
  for (const origin of [
    "http://interview.example.com", "http://192.168.1.1:3000", "http://10.0.0.1:3000",
    "http://169.254.169.254", "http://localhost.example.com:3000", "http://[::2]:3000",
    "http://localhost:80", "http://localhost/", "http://localhost:3000/path",
  ]) {
    assert.equal(parsePublicOrigin(origin, "development"), null, `must reject ${origin}`);
  }
  assert.equal(parsePublicOrigin("http://localhost", "development"), "http://localhost");
});

test("rejectCrossOrigin allows only an exact Origin header matching the configured trust anchor", () => {
  assert.equal(rejectCrossOrigin(request(PUBLIC), PUBLIC), null);
  // The request URL and proxy routing may differ; neither is used as the trust anchor.
  assert.equal(rejectCrossOrigin(request(PUBLIC, { host: "attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" }), PUBLIC), null);

  for (const origin of [
    null, "", "null", "https://evil.example", "https://interview.example.com.evil.example",
    "http://interview.example.com", "https://interview.example.com:443",
    "https://interview.example.com/", "HTTPS://interview.example.com",
    `${PUBLIC}, https://evil.example`, `${PUBLIC} https://evil.example`,
    "https://user@interview.example.com", "https://interview.example.com/path",
  ]) {
    const denied = rejectCrossOrigin(request(origin, {
      host: "interview.example.com", "x-forwarded-host": "interview.example.com",
      "x-forwarded-proto": "https", forwarded: "host=interview.example.com;proto=https",
      referer: `${PUBLIC}/new`,
    }), PUBLIC);
    assert.ok(denied, `must reject ${JSON.stringify(origin)}`);
    assert.equal(denied.status, 403);
    assertPrivate(denied);
  }
});

test("rejectCrossOrigin fails closed without a configured public origin, before consuming the body", () => {
  for (const origin of [PUBLIC, null, "null"]) {
    const req = request(origin);
    Object.defineProperty(req, "json", { value: () => { throw new Error("body was read"); } });
    const denied = rejectCrossOrigin(req, null);
    assert.equal(denied?.status, 403);
    assert.equal(req.bodyUsed, false);
    assertPrivate(denied!);
  }
});

test("privateJson enforces private no-store and no-referrer even if caller supplies weaker headers", async () => {
  const response = privateJson({ ok: true }, {
    status: 202,
    headers: {
      "cache-control": "public, max-age=3600", "referrer-policy": "unsafe-url",
      "x-request-id": "test-id",
    },
  });
  assert.equal(response.status, 202);
  assertPrivate(response);
  assert.equal(response.headers.get("x-request-id"), "test-id");
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true });
});

test("each mutation route rejects unsafe Origin before reading body or accessing SQLite/providers", async () => {
  // Route handlers import Next's server-only marker; the marker is supplied by
  // Next at runtime, but direct node:test imports need a no-op module shim.
  // Do not shim the database: give it a disposable path before importing routes.
  const dir = mkdtempSync(join(tmpdir(), "origin-guard-test-"));
  const previousDb = process.env.INTERVIEW_DB_PATH;
  const previousOrigin = process.env.PUBLIC_ORIGIN;
  // Node's internal CJS loader is intentionally absent from @types/node.
  type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
  const loader = Module as unknown as { _load: Loader };
  const originalLoad = loader._load;
  process.env.INTERVIEW_DB_PATH = join(dir, "isolated.db");
  process.env.PUBLIC_ORIGIN = PUBLIC;
  loader._load = function (id: string, ...args: [unknown, boolean?]) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
  };

  try {
    const [models, testKey, sessions, messages, evaluate, session, admin, schema, attempts, report] = await Promise.all([
      import("../app/api/models/route"),
      import("../app/api/test-key/route"),
      import("../app/api/sessions/route"),
      import("../app/api/sessions/[id]/messages/route"),
      import("../app/api/sessions/[id]/evaluate/route"),
      import("../app/api/sessions/[id]/route"),
      import("../app/api/admin/db/route"),
      import("../app/api/admin/schema/route"),
      import("../app/api/sessions/[id]/attempts/route"),
      import("../app/api/sessions/[id]/report/route"),
    ]);
    const db = await import("./db");
    const routeParams = { params: { id: "untouched-session" } };
    const routes: Array<{ name: string; invoke: (req: Request) => Promise<Response> }> = [
      { name: "models POST", invoke: models.POST },
      { name: "test-key POST", invoke: testKey.POST },
      { name: "sessions POST", invoke: sessions.POST },
      { name: "messages POST", invoke: (req) => messages.POST(req, routeParams) },
      { name: "evaluate POST", invoke: (req) => evaluate.POST(req, routeParams) },
      { name: "session DELETE", invoke: (req) => session.DELETE(req, routeParams) },
      { name: "admin db POST", invoke: admin.POST },
    ];
    const existing = db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM sessions")?.n;
    assert.equal(existing, 0);

    for (const origin of [null, "", "null", "https://evil.example", `${PUBLIC},https://evil.example`, PUBLIC]) {
      // A valid header with invalid config must fail closed, too.
      process.env.PUBLIC_ORIGIN = origin === PUBLIC ? "https://interview.example.com/" : PUBLIC;
      for (const route of routes) {
        const req = new Request("http://internal-service:3000/api/mutation", {
          method: route.name.endsWith("DELETE") ? "DELETE" : "POST",
          headers: {
            ...(origin === null ? {} : { origin }),
            host: "interview.example.com", "x-forwarded-host": "interview.example.com",
            "x-forwarded-proto": "https", referer: `${PUBLIC}/new`,
          },
          body: route.name.endsWith("DELETE") ? undefined : '{"action":"wipe-all"}',
        });
        Object.defineProperty(req, "json", { value: () => { throw new Error("body was parsed"); } });
        const response = await route.invoke(req);
        assert.equal(response.status, 403, `${route.name} must reject ${JSON.stringify(origin)}`);
        assertPrivate(response);
        assert.equal(req.bodyUsed, false, `${route.name} must not consume request body`);
        assert.equal(db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM sessions")?.n, 0);
      }
    }

    process.env.PUBLIC_ORIGIN = PUBLIC;
    for (const { name, invoke } of [
      { name: "models", invoke: models.POST },
      { name: "test-key", invoke: testKey.POST },
    ]) {
      const req = new Request("http://internal-service:3000/api/" + name, {
        method: "POST", headers: { origin: PUBLIC, "content-type": "application/json" }, body: "{}",
      });
      const response = await invoke(req);
      assert.equal(response.status, 400, `${name}: valid origin should reach input validation`);
      assert.equal(req.bodyUsed, true);
      assertPrivate(response);
    }

    const getCases: Array<{ name: string; invoke: () => Promise<Response>; expectedStatus: number }> = [
      { name: "sessions list", invoke: () => sessions.GET(new Request(`${PUBLIC}/api/sessions`)), expectedStatus: 200 },
      { name: "session with CV", invoke: () => session.GET(new Request(`${PUBLIC}/api/sessions/untouched-session`), routeParams), expectedStatus: 404 },
      { name: "attempts raw", invoke: () => attempts.GET(new Request(`${PUBLIC}/api/sessions/untouched-session/attempts?raw=1`), routeParams), expectedStatus: 404 },
      { name: "report", invoke: () => report.GET(new Request(`${PUBLIC}/api/sessions/untouched-session/report`), routeParams), expectedStatus: 404 },
      { name: "admin db", invoke: admin.GET, expectedStatus: 200 },
      { name: "admin schema", invoke: schema.GET, expectedStatus: 200 },
    ];
    for (const route of getCases) {
      const response = await route.invoke();
      assert.equal(response.status, route.expectedStatus, route.name);
      assertPrivate(response);
    }

    // Exercise successful sensitive GETs using a disposable session with a CV
    // and an evaluation attempt; the raw model block must also be non-cacheable.
    db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model)
      VALUES (?, 'Backend', 'en', 'strict', 5, 'openai', 'test-model')`, [routeParams.params.id]);
    db.exec(`INSERT INTO cv_extracts (session_id, source, text, char_count)
      VALUES (?, 'paste', 'private CV', 10)`, [routeParams.params.id]);
    db.exec(`INSERT INTO evaluation_attempts (session_id, attempt_id, outcome, raw_response)
      VALUES (?, 'attempt-1', 'failed', 'private raw model block')`, [routeParams.params.id]);
    const hydrated = await session.GET(new Request(`${PUBLIC}/api/sessions/untouched-session`), routeParams);
    assert.equal(hydrated.status, 200);
    assertPrivate(hydrated);
    assert.equal((await hydrated.json()).cv[0].text, "private CV");
    const raw = await attempts.GET(new Request(`${PUBLIC}/api/sessions/untouched-session/attempts?raw=1`), routeParams);
    assert.equal(raw.status, 200);
    assertPrivate(raw);
    assert.equal((await raw.json()).attempts[0].raw, "private raw model block");

    // Missing credentials must never reach the provider and still return private JSON.
    const invalidMessage = await messages.POST(new Request(`${PUBLIC}/api/sessions/untouched-session/messages`, {
      method: "POST", headers: { origin: PUBLIC, "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", model: "test-model", answer: "answer" }),
    }), routeParams);
    assert.equal(invalidMessage.status, 400); // Missing API key: no provider call.
    assertPrivate(invalidMessage);

    const { providers } = await import("./providers");
    const originalStream = providers.openai.streamChat;
    let providerCalls = 0;
    providers.openai.streamChat = async () => {
      providerCalls += 1;
      return {
        textStream: (async function* () { yield "What trade-off did you make?"; })(),
        meta: Promise.resolve({ latency_ms: 1, raw_blocks: {} }),
      };
    };
    try {
      const streamed = await messages.POST(new Request(`${PUBLIC}/api/sessions/untouched-session/messages`, {
        method: "POST", headers: { origin: PUBLIC, "x-api-key": "fake-test-key", "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", model: "test-model", answer: "" }),
      }), routeParams);
      assert.equal(streamed.status, 200);
      assert.equal(streamed.headers.get("content-type"), "text/event-stream; charset=utf-8");
      assert.equal(streamed.headers.get("cache-control"), "private, no-store, no-transform");
      assert.equal(streamed.headers.get("referrer-policy"), "no-referrer");
      assert.match(await streamed.text(), /What trade-off did you make\?/);
      assert.equal(providerCalls, 1);
    } finally {
      providers.openai.streamChat = originalStream;
    }
  } finally {
    loader._load = originalLoad;
    if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
    else process.env.INTERVIEW_DB_PATH = previousDb;
    if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previousOrigin;
    rmSync(dir, { recursive: true, force: true });
  }
});
