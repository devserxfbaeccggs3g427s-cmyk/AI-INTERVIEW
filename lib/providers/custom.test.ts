import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { customProvider } from "./custom";
import { openaiProvider } from "./openai";
import type { AuthedConfig } from "./types";

let server: Server;
let baseUrl: string;
const previousPrivate = process.env.ALLOW_PRIVATE_BASE_URL;
const captured: Array<{ path: string; authorization?: string }> = [];

before(async () => {
  server = createServer(async (req, res) => {
    captured.push({ path: req.url ?? "", authorization: req.headers.authorization });
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "local-model" }] }));
    } else if (req.url === "/v1/chat/completions") {
      for await (const _ of req) { /* Drain request body. */ }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end('data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local mock port");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
  process.env.ALLOW_PRIVATE_BASE_URL = "1";
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previousPrivate === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previousPrivate;
});

function cfg(base = baseUrl, key?: string): AuthedConfig {
  return { provider: "custom", model: "local-model", base_url: base, _base: base,
    _key: key, temperature: 0.4, max_tokens: 1024, top_p: 0.9 };
}

const ctx = { sessionId: "test", trace: "test" };

test("keyless custom model listing, test and SSE use local /v1", async () => {
  const result = await customProvider.testKey(ctx, cfg());
  assert.equal(result.ok, true, result.detail);
  const models = await customProvider.listModels(ctx, cfg());
  assert.deepEqual(models, [{ id: "local-model" }]);
  const stream = await customProvider.streamChat(cfg(), [{ role: "user", content: "hi" }], {});
  let text = "";
  for await (const chunk of stream.textStream) text += chunk;
  assert.equal(text, "hello");
  assert.equal((await stream.meta).finish_reason, "stop");
  assert.deepEqual(captured.slice(-3).map((r) => r.path), ["/v1/models", "/v1/models", "/v1/chat/completions"]);
  assert.ok(captured.slice(-3).every((r) => r.authorization === undefined));
});

test("custom bearer token is only attached when provided", async () => {
  const result = await customProvider.testKey(ctx, cfg(baseUrl, "local-secret"));
  assert.equal(result.ok, true);
  assert.equal(captured.at(-1)?.authorization, "Bearer local-secret");
});

test("missing custom base fails before networking and OpenAI has fixed destination", async () => {
  const beforeCount = captured.length;
  await assert.rejects(() => customProvider.streamChat({ ...cfg(), _base: undefined }, [], {}), /Base URL/);
  assert.equal(captured.length, beforeCount);
  assert.equal(openaiProvider.id, "openai");
});
