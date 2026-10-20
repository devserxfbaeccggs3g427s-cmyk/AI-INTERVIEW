import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { SessionRow } from "../types";

const previousEnabled = process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
const previousPrivate = process.env.ALLOW_PRIVATE_BASE_URL;
process.env.NEXT_PUBLIC_PROVIDER_ENABLE = "anthropic,openai,gemini,custom";
process.env.ALLOW_PRIVATE_BASE_URL = "1";

after(() => {
  if (previousEnabled === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
  else process.env.NEXT_PUBLIC_PROVIDER_ENABLE = previousEnabled;
  if (previousPrivate === undefined) delete process.env.ALLOW_PRIVATE_BASE_URL;
  else process.env.ALLOW_PRIVATE_BASE_URL = previousPrivate;
});

const modules = Promise.all([import("./parse"), import("./session-config")]);
const input = { provider: "custom", model: "llama3.1", baseUrl: "http://localhost:11434/", temperature: 0.4, maxTokens: 1024, topP: 0.9 };

test("custom Base URL is normalized and carried into credentials", async () => {
  const [{ modelConfigInput, parseModelConfig }] = await modules;
  const result = parseModelConfig(input, undefined, modelConfigInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cfg.base_url, "http://localhost:11434/v1");
  assert.equal(result.cfg._base, result.cfg.base_url);
  assert.equal(result.cfg._key, undefined);
});

test("missing or forbidden custom Base URL fails before reaching provider", async () => {
  const [{ modelConfigInput, parseModelConfig }] = await modules;
  const missing = parseModelConfig({ ...input, baseUrl: undefined }, undefined, modelConfigInput);
  assert.equal(missing.ok, false);
  const metadata = parseModelConfig({ ...input, baseUrl: "http://169.254.169.254/v1" }, undefined, modelConfigInput);
  assert.equal(metadata.ok, false);
});

test("hosted provider cannot override its destination with baseUrl", async () => {
  const [{ modelConfigInput, parseModelConfig }] = await modules;
  const result = parseModelConfig({ ...input, provider: "openai", baseUrl: "https://example.com/v1" }, "sk-proj-example", modelConfigInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cfg.base_url, null);
  assert.equal(result.cfg._base, undefined);
});

test("session configuration rejects provider, model and destination drift", async () => {
  const [{ modelConfigInput, parseModelConfig }, { resolveSessionConfig }] = await modules;
  const result = parseModelConfig(input, undefined, modelConfigInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const session = { ...result.cfg, base_url: result.cfg.base_url, id: "sess_example" } as SessionRow;
  const resolved = resolveSessionConfig(session, result.cfg);
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.cfg._base, session.base_url);
  assert.equal(resolveSessionConfig(session, { ...result.cfg, provider: "openai" }).ok, false);
  assert.equal(resolveSessionConfig(session, { ...result.cfg, model: "other" }).ok, false);
  assert.equal(resolveSessionConfig(session, { ...result.cfg, base_url: "http://127.0.0.1:11434/v1" }).ok, false);
  assert.equal(resolveSessionConfig({ ...session, base_url: null }, result.cfg).ok, false);
});
