/**
 * Tests for lib/net/guarded-transport.ts.
 *
 *   node --test lib/net/guarded-transport.test.mjs
 *
 * Offline. Nothing here touches a network beyond a loopback HTTP server that
 * the test itself starts, and the resolver is always injected — so the suite
 * cannot be used (accidentally) to probe an internal host.
 *
 * Written as .mjs because the app sources use extensionless relative imports,
 * which `moduleResolution: "bundler"` requires and Node's native ESM resolver
 * cannot follow. The two-line resolve hook below bridges exactly that gap and
 * is test-only; the shipped code never needs it.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import http from "node:http";
import { after, describe, it } from "node:test";

const RESOLVE_HOOK = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]s$/.test(specifier)) {
    try { return await nextResolve(specifier + ".ts", context); } catch {}
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(RESOLVE_HOOK)}`, import.meta.url);

const { TransportError, guardedRequest } = await import("./guarded-transport.ts");
const { UrlPolicyError } = await import("./url-policy.ts");

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** A resolver that returns a fixed answer list and counts how often it ran. */
function fakeResolver(addresses, { fail = false } = {}) {
  const calls = [];
  const resolver = (hostname, options, callback) => {
    calls.push({ hostname, options });
    if (fail) {
      queueMicrotask(() => callback(new Error("EAI_AGAIN internal-host-detail")));
      return;
    }
    queueMicrotask(() => callback(null, addresses));
  };
  resolver.calls = calls;
  return resolver;
}

const neverResolver = () => {
  throw new Error("resolver must not be reached");
};

async function rejectsWithCode(promise, code, label) {
  let thrown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `${label}: expected a rejection, but the call resolved`);
  assert.ok(
    thrown instanceof UrlPolicyError || thrown instanceof TransportError,
    `${label}: expected TransportError/UrlPolicyError, got ${thrown}`,
  );
  assert.equal(thrown.code, code, `${label}: expected code "${code}", got "${thrown.code}"`);
  return thrown;
}

/** Starts a loopback server for one request and returns its base URL. */
async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/* -------------------------------------------------------------------------- */
/* Policy gates — nothing may reach DNS                                       */
/* -------------------------------------------------------------------------- */

describe("refuses before resolving anything", () => {
  const rejected = [
    ["https://localhost/v1", "blocked_hostname"],
    ["https://169.254.169.254/v1", "unsafe_address"],
    ["https://169.254.169.254/latest/meta-data/", "unsafe_address"],
    ["https://[::1]/v1", "unsafe_address"],
    ["https://127.0.0.1/v1", "unsafe_address"],
    ["https://10.0.0.5/v1", "unsafe_address"],
    ["https://192.168.1.1/v1", "unsafe_address"],
    ["https://metadata.google.internal/v1", "blocked_hostname"],
    ["http://api.openai.com/v1", "unsupported_protocol"],
    ["https://user:pass@api.openai.com/v1", "credentials_in_url"],
    ["https://api.openai.com/v1?x=1", "query_or_fragment"],
    ["https://api.openai.com/v1%2f..%2fadmin", "forbidden_characters"],
  ];

  for (const [base, code] of rejected) {
    it(`rejects ${base}`, async () => {
      await rejectsWithCode(
        guardedRequest(base, "models", { method: "GET" }, { resolver: neverResolver }),
        code,
        base,
      );
    });
  }

  it("still rejects reserved targets when the local opt-in is on", async () => {
    for (const base of ["https://169.254.169.254/v1", "https://[fe80::1]/v1", "https://0.0.0.0/v1"]) {
      await rejectsWithCode(
        guardedRequest(base, "models", { method: "GET" }, { resolver: neverResolver, allowPrivate: true }),
        "unsafe_address",
        `${base} + optin`,
      );
    }
  });

  it("rejects an unknown endpoint", async () => {
    await rejectsWithCode(
      guardedRequest("https://api.openai.com/v1", "admin", { method: "GET" }, { resolver: neverResolver }),
      "invalid_request",
      "unknown endpoint",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Connect-time DNS guard                                                     */
/* -------------------------------------------------------------------------- */

describe("connect-time DNS guard", () => {
  it("refuses a public name that resolves to loopback", async () => {
    // The URL passes every pre-DNS check; only the resolved address convicts it.
    const resolver = fakeResolver([{ address: "127.0.0.1", family: 4 }]);
    await rejectsWithCode(
      guardedRequest("https://rebind.example.com/v1", "models", { method: "GET" }, { resolver }),
      "unsafe_address",
      "rebind to loopback",
    );
    assert.equal(resolver.calls.length, 1, "resolver should have been consulted once");
  });

  it("refuses a public name that resolves to metadata", async () => {
    const resolver = fakeResolver([{ address: "169.254.169.254", family: 4 }]);
    await rejectsWithCode(
      guardedRequest("https://rebind.example.com/v1", "models", { method: "GET" }, { resolver }),
      "unsafe_address",
      "rebind to metadata",
    );
  });

  it("validates every answer, not just the one it would use", async () => {
    // Answer order is attacker-controlled. Taking the first "good" record and
    // ignoring the rest would make the next connection land on loopback.
    const resolver = fakeResolver([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await rejectsWithCode(
      guardedRequest("https://mixed.example.com/v1", "models", { method: "GET" }, { resolver }),
      "unsafe_address",
      "mixed answers",
    );
  });

  it("refuses an empty answer set", async () => {
    const resolver = fakeResolver([]);
    await rejectsWithCode(
      guardedRequest("https://empty.example.com/v1", "models", { method: "GET" }, { resolver }),
      "dns_failed",
      "empty answers",
    );
  });

  it("times out an unresolved DNS lookup before opening a socket", async () => {
    let callback;
    const resolver = (_hostname, _options, cb) => { callback = cb; };
    const started = Date.now();
    await rejectsWithCode(
      guardedRequest("https://slow.example.com/v1", "models", { method: "GET" }, {
        resolver,
        connectTimeoutMs: 60,
      }),
      "connect_timeout",
      "unresolved DNS",
    );
    assert.ok(Date.now() - started < 1000, "DNS must not exceed the connection deadline");
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
  });

  it("aborts an unresolved DNS lookup without opening a socket", async () => {
    const controller = new AbortController();
    const resolver = () => { controller.abort(); };
    await rejectsWithCode(
      guardedRequest("https://slow.example.com/v1", "models", { method: "GET", signal: controller.signal }, {
        resolver,
        connectTimeoutMs: 1000,
      }),
      "aborted",
      "aborted DNS",
    );
  });

  it("collapses a resolver error without leaking its detail", async () => {
    const resolver = fakeResolver([], { fail: true });
    const error = await rejectsWithCode(
      guardedRequest("https://broken.example.com/v1", "models", { method: "GET" }, { resolver }),
      "dns_failed",
      "resolver error",
    );
    assert.ok(!/EAI_AGAIN|internal-host-detail/.test(error.message), "must not echo resolver detail");
  });

  it("refuses a resolver that answers with an unauditable shape", async () => {
    const resolver = (hostname, options, callback) => queueMicrotask(() => callback(null, "93.184.216.34"));
    await rejectsWithCode(
      guardedRequest("https://odd.example.com/v1", "models", { method: "GET" }, { resolver }),
      "dns_failed",
      "non-array answers",
    );
  });

  it("refuses a resolver whose family disagrees with the address", async () => {
    const resolver = fakeResolver([{ address: "93.184.216.34", family: 6 }]);
    await rejectsWithCode(
      guardedRequest("https://odd.example.com/v1", "models", { method: "GET" }, { resolver }),
      "dns_failed",
      "family mismatch",
    );
  });

  it("lets the opt-in cleartext-downgrade a public name (policy passes; failure is downstream)", async () => {
    // With ALLOW_PRIVATE_BASE_URL=1, plain http to a public name now passes the
    // URL policy gate. The request still has to clear DNS — an empty answer list
    // short-circuits that without a real network call.
    const resolver = fakeResolver([]);
    await rejectsWithCode(
      guardedRequest("http://api.openai.com/v1", "models", { method: "GET" }, { resolver, allowPrivate: true }),
      "dns_failed",
      "policy passed, DNS did not",
    );
  });

  it("does not resolve when the signal is already aborted", async () => {
    await rejectsWithCode(
      guardedRequest("https://api.openai.com/v1", "models", { method: "GET", signal: AbortSignal.abort() }, {
        resolver: neverResolver,
      }),
      "aborted",
      "pre-aborted",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Request-shape validation                                                    */
/* -------------------------------------------------------------------------- */

describe("request validation", () => {
  it("refuses a Host header", async () => {
    await rejectsWithCode(
      guardedRequest(
        "https://api.openai.com/v1",
        "models",
        { method: "GET", headers: { host: "169.254.169.254" } },
        { resolver: neverResolver },
      ),
      "invalid_request",
      "host header",
    );
  });

  it("refuses header injection through a newline", async () => {
    await rejectsWithCode(
      guardedRequest(
        "https://api.openai.com/v1",
        "models",
        { method: "GET", headers: { "x-test": "a\r\nX-Injected: 1" } },
        { resolver: neverResolver },
      ),
      "invalid_request",
      "CRLF header",
    );
  });

  it("refuses a non-string body", async () => {
    await rejectsWithCode(
      guardedRequest(
        "https://api.openai.com/v1",
        "chat/completions",
        { method: "POST", body: new URLSearchParams({ a: "b" }) },
        { resolver: neverResolver },
      ),
      "invalid_request",
      "form body",
    );
  });

  it("refuses a GET with a body", async () => {
    await rejectsWithCode(
      guardedRequest(
        "https://api.openai.com/v1",
        "models",
        { method: "GET", body: "{}" },
        { resolver: neverResolver },
      ),
      "invalid_request",
      "GET with body",
    );
  });

  it("refuses an unsupported method", async () => {
    await rejectsWithCode(
      guardedRequest(
        "https://api.openai.com/v1",
        "models",
        { method: "DELETE" },
        { resolver: neverResolver },
      ),
      "invalid_request",
      "DELETE",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* End-to-end over a loopback socket                                          */
/* -------------------------------------------------------------------------- */

describe("request/response handling", () => {
  it("performs a guarded GET and returns the body", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ path: req.url, auth: req.headers.authorization }));
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "models",
          { method: "GET", headers: { authorization: "Bearer secret" } },
          { allowPrivate: true },
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "application/json");
        const payload = await response.json();
        assert.equal(payload.path, "/v1/models");
        assert.equal(payload.auth, "Bearer secret");
      },
    );
  });

  it("performs a guarded POST", async () => {
    await withServer(
      (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ path: req.url, body }));
        });
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "chat/completions",
          { method: "POST", body: JSON.stringify({ model: "m" }) },
          { allowPrivate: true },
        );
        const payload = await response.json();
        assert.equal(payload.path, "/v1/chat/completions");
        assert.deepEqual(JSON.parse(payload.body), { model: "m" });
      },
    );
  });

  it("pins the connection to the validated address", async () => {
    // The name never resolves for real; the injected resolver points it at the
    // loopback server. Reaching the server at all proves the socket used the
    // pinned address rather than re-resolving the name.
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ host: req.headers.host }));
      },
      async (base) => {
        const port = new URL(base).port;
        const resolver = fakeResolver([{ address: "127.0.0.1", family: 4 }]);
        const response = await guardedRequest(
          `http://pinned.example.com:${port}/v1`,
          "models",
          { method: "GET" },
          { resolver, allowPrivate: true },
        );
        assert.equal(response.status, 200);
        assert.equal(resolver.calls.length, 1);
        assert.equal(resolver.calls[0].hostname, "pinned.example.com");
        assert.equal(resolver.calls[0].options.all, true);
      },
    );
  });

  it("refuses a redirect instead of following it", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      },
      async (base) => {
        await rejectsWithCode(
          guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true }),
          "redirect_not_allowed",
          "302",
        );
      },
    );
  });

  it("refuses a compressed response", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
        res.end("not-really-gzip");
      },
      async (base) => {
        await rejectsWithCode(
          guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true }),
          "unsupported_encoding",
          "gzip",
        );
      },
    );
  });

  it("caps a non-streaming response", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("x".repeat(4096));
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "models",
          { method: "GET" },
          { allowPrivate: true, maxResponseBytes: 512 },
        );
        await assert.rejects(() => response.text(), (error) => error.code === "response_too_large");
      },
    );
  });

  it("caps a response rejected up front by its declared length", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "application/json", "content-length": "4096" });
        res.end("x".repeat(4096));
      },
      async (base) => {
        await rejectsWithCode(
          guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true, maxResponseBytes: 512 }),
          "response_too_large",
          "declared length",
        );
      },
    );
  });

  it("times out a server that never answers", async () => {
    await withServer(
      () => {
        /* deliberately silent */
      },
      async (base) => {
        await rejectsWithCode(
          guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true, connectTimeoutMs: 150 }),
          "connect_timeout",
          "silent server",
        );
      },
    );
  });

  it("times out a body that stalls mid-stream", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("data: partial\n\n");
        // ...and then nothing.
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "chat/completions",
          { method: "POST", body: "{}" },
          { allowPrivate: true, bodyTimeoutMs: 150 },
        );
        const reader = response.body.getReader();
        await reader.read();
        await assert.rejects(
          () => reader.read(),
          (error) => error.code === "body_timeout",
        );
      },
    );
  });

  it("honours an abort after the response has started", async () => {
    const controller = new AbortController();
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("data: open\n\n");
        // ...and then stalls. Only an honoured abort ends this promptly.
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "chat/completions",
          { method: "POST", body: "{}", signal: controller.signal },
          { allowPrivate: true, bodyTimeoutMs: 30_000 },
        );
        const reader = response.body.getReader();
        await reader.read();

        const startedAt = Date.now();
        controller.abort();
        await assert.rejects(() => reader.read(), (error) => error.code === "aborted");
        assert.ok(
          Date.now() - startedAt < 1000,
          "abort must stop the transfer, not wait out the idle timeout",
        );
      },
    );
  });

  it("surfaces a non-2xx response instead of throwing", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad key" }));
      },
      async (base) => {
        const response = await guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true });
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: "bad key" });
      },
    );
  });

  it("handles a 204 with no body", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(204);
        res.end();
      },
      async (base) => {
        const response = await guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true });
        assert.equal(response.status, 204);
        assert.equal(response.body, null);
      },
    );
  });

  it("streams an SSE response without buffering it whole", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("data: one\n\n");
        res.write("data: two\n\n");
        res.end("data: [DONE]\n\n");
      },
      async (base) => {
        const response = await guardedRequest(
          base,
          "chat/completions",
          { method: "POST", body: "{}" },
          { allowPrivate: true },
        );
        assert.equal(await response.text(), "data: one\n\ndata: two\n\ndata: [DONE]\n\n");
      },
    );
  });

  it("lets the caller cancel an unread body without an uncaught error", async () => {
    // `testKey` reads only the status of /models and drops the body. Cancelling
    // must tear the socket down quietly: destroying the socket behind toWeb's
    // back would make it report the premature close against a closed
    // controller, which surfaces as a process-level uncaught exception.
    const uncaught = [];
    const onUncaught = (error) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    try {
      await withServer(
        (req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ data: [{ id: "m" }] }));
        },
        async (base) => {
          for (let i = 0; i < 5; i += 1) {
            const response = await guardedRequest(base, "models", { method: "GET" }, { allowPrivate: true });
            assert.equal(response.status, 200);
            await response.body.cancel();
          }
        },
      );
      // Give toWeb a tick to report anything the cancelled transfers raised.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(uncaught, []);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });

  it("gives a streaming response a larger cap than a JSON one", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end("y".repeat(4096));
      },
      async (base) => {
        // 512 bytes would be too small for JSON but is fine for SSE.
        const response = await guardedRequest(
          base,
          "chat/completions",
          { method: "POST", body: "{}" },
          { allowPrivate: true, maxResponseBytes: 512, maxStreamBytes: 8192 },
        );
        assert.equal((await response.text()).length, 4096);
      },
    );
  });
});

after(() => {
  // Nothing global to tear down; the per-test server is closed in `withServer`.
});
