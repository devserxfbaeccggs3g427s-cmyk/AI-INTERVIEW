/**
 * Regression tests for per-provider BYOK preference storage (T-05.3).
 *
 * What these lock down:
 *  1. Switching provider used to keep the previous provider's apiKey, so a key
 *     could be sent to the wrong vendor. The distinctive "SECRETVALUE" fixture
 *     is the direct guard against that ever being persisted again.
 *  2. Each provider's model/temperature/topP/maxTokens used to be lost on
 *     switch, so A -> B -> A reset A back to registry defaults.
 *  3. An in-flight fetchModels response could clobber a model the user typed
 *     by hand while it was loading — hence the manualModelEdit guard.
 *
 * `lib/providers/registry.ts` reads NEXT_PUBLIC_PROVIDER_ENABLE at import time;
 * with no override that enables anthropic/openai/gemini and leaves custom off.
 * `switchProvider`/`defaultPrefsFor` accept any ProviderId regardless of
 * whether it is enabled, so these tests still exercise `custom`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activePrefs,
  applyFetchedModels,
  defaultPrefs,
  defaultPrefsFor,
  deserialize,
  migrate,
  serialize,
  setActivePrefs,
  switchProvider,
  type ByokPrefs,
} from "./byok-prefs";
import { ENABLED_PROVIDER_IDS, PROVIDER_IDS, PROVIDER_REGISTRY } from "./providers/registry";

/** Same resolution order ByokConfigContext uses for its cold-start default. */
const DEFAULT_PROVIDER =
  ENABLED_PROVIDER_IDS.find((id) => PROVIDER_REGISTRY[id].preferred) ?? ENABLED_PROVIDER_IDS[0];

/** Fresh state for a given provider, with a distinctive key already set. */
function stateFor(provider: (typeof PROVIDER_IDS)[number], apiKey = "sk-ant-SECRETVALUE"): ByokPrefs {
  const base = defaultPrefs();
  return { ...base, provider, apiKey };
}

test("defaultPrefsFor returns the registry default for every ProviderId", () => {
  const cases: [string, string, string, number, number, number][] = [
    // provider, model, baseUrl, temperature, maxTokens, topP
    ["anthropic", "claude-3-5-sonnet-20241022", "", 0.4, 4096, 0.95],
    ["openai", "gpt-4o", "", 0.4, 4096, 0.95],
    ["gemini", "gemini-1.5-pro-latest", "", 0.4, 4096, 0.95],
    ["custom", "custom-model-local", "", 0.4, 4096, 0.95],
  ];
  for (const [id, model, baseUrl, temperature, maxTokens, topP] of cases) {
    assert.deepEqual(
      defaultPrefsFor(id as (typeof PROVIDER_IDS)[number]),
      { model, baseUrl, temperature, maxTokens, topP },
      `provider=${id}`,
    );
  }
  // Table must cover every provider the registry declares.
  assert.equal(cases.length, PROVIDER_IDS.length, "table covers every ProviderId");
});

test("migrate lifts a v1 flat payload into prefsByProvider and carries key/sessionOnly", () => {
  const migrated = migrate({
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://example.test/v1",
    apiKey: "sk-ant-SECRETVALUE",
    temperature: 0.9,
    maxTokens: 8192,
    topP: 0.5,
    sessionOnly: false,
  });

  assert.ok(migrated, "v1 payload migrates");
  assert.equal(migrated.version, 2);
  assert.equal(migrated.provider, "openai");
  assert.equal(migrated.apiKey, "sk-ant-SECRETVALUE");
  assert.equal(migrated.sessionOnly, false);
  assert.equal(migrated.manualModelEdit, false, "manual flags start clean");
  assert.equal(migrated.manualEditSeq, 0);
  assert.deepEqual(
    migrated.prefsByProvider.openai,
    { model: "gpt-4o-mini", baseUrl: "https://example.test/v1", temperature: 0.9, maxTokens: 8192, topP: 0.5 },
  );
  // v1 prefs are scoped to exactly one provider — nothing else is invented.
  assert.deepEqual(Object.keys(migrated.prefsByProvider), ["openai"]);
});

test("migrate round-trips a v2 payload unchanged", () => {
  const original: ByokPrefs = {
    version: 2,
    sessionOnly: true,
    provider: "gemini",
    apiKey: "AIzaSyKEEP",
    prefsByProvider: {
      gemini: { model: "gemini-1.5-flash-latest", baseUrl: "", temperature: 0.1, maxTokens: 1024, topP: 0.7 },
      openai: { model: "o1-mini", baseUrl: "", temperature: 0.2, maxTokens: 2048, topP: 0.8 },
    },
    manualModelEdit: true,
    manualEditSeq: 4,
  };

  const round = deserialize(serialize(original));
  assert.deepEqual(round, original, "serialize -> deserialize is stable");
  // And a second trip is a fixed point.
  assert.equal(serialize(deserialize(serialize(original)) as ByokPrefs), serialize(original));
});

test("migrate rejects garbage", () => {
  const cases: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["\"null\" JSON text", JSON.parse("null")],
    ["[]", JSON.parse("[]")],
    ["42", 42],
    ["empty object (missing provider)", {}],
    ["provider explicitly null", { provider: null }],
    ["v2 without a prefs map", { version: 2, provider: "openai", prefsByProvider: [] }],
    ["non-numeric JSON", "@@@"],
  ];
  for (const [label, raw] of cases) {
    assert.equal(migrate(raw), null, `rejects ${label}`);
  }
  assert.equal(deserialize("@@@"), null, "deserialize rejects malformed JSON");
  assert.equal(deserialize(""), null, "deserialize rejects empty text");
});

test("migrate drops prefs for an unknown provider instead of persisting the key", () => {
  const migrated = migrate({
    provider: "nope",
    model: "rogue-model",
    baseUrl: "https://rogue.test/v1",
    temperature: 1.5,
    apiKey: "sk-ant-SECRETVALUE",
  });

  assert.ok(migrated);
  assert.equal(migrated.provider, DEFAULT_PROVIDER, "unknown provider falls back to the registry default");
  assert.equal(
    Object.prototype.hasOwnProperty.call(migrated.prefsByProvider, "nope"),
    false,
    "no unknown key is persisted",
  );
  // The rogue values are gone; the default provider gets stock prefs.
  assert.deepEqual(migrated.prefsByProvider[DEFAULT_PROVIDER], defaultPrefsFor(DEFAULT_PROVIDER));
  assert.equal(serialize(migrated).includes("rogue-model"), false);
});

test("migrate falls back to defaults for a non-finite v1 number instead of storing NaN", () => {
  const migrated = migrate({
    provider: "openai",
    model: "gpt-4o",
    temperature: "hot",
    maxTokens: null,
    topP: Number.NaN,
  });

  assert.ok(migrated);
  const prefs = migrated.prefsByProvider.openai;
  assert.ok(prefs);
  assert.equal(prefs.temperature, 0.4, "temperature:\"hot\" falls back to 0.4");
  assert.equal(prefs.maxTokens, 4096, "null maxTokens falls back to 4096");
  assert.equal(prefs.topP, 0.95, "NaN topP falls back to 0.95");
  assert.equal(Object.values(prefs).some((v) => typeof v === "number" && !Number.isFinite(v)), false);
});

test("switchProvider A -> B -> A preserves each provider's prefs and never keeps the key", () => {
  const a: ByokPrefs = {
    ...stateFor("openai", "sk-ant-SECRETVALUE"),
    prefsByProvider: {
      openai: { model: "o1-mini", baseUrl: "", temperature: 0.33, maxTokens: 7777, topP: 0.44 },
    },
    manualEditSeq: 3,
  };

  const onB = switchProvider(a, "anthropic");
  assert.equal(onB.apiKey, "", "key is cleared on switch");
  assert.equal(onB.provider, "anthropic");
  assert.deepEqual(onB.prefsByProvider.anthropic, defaultPrefsFor("anthropic"), "B gets its defaults");
  assert.equal(onB.manualModelEdit, false, "switch resets the manual guard");
  assert.equal(onB.manualEditSeq, 4, "switch bumps manualEditSeq");
  assert.equal(serialize(onB).includes("SECRETVALUE"), false, "the key is not persisted after a switch");
  // A's prefs are still in the map while B is active.
  assert.deepEqual(onB.prefsByProvider.openai, a.prefsByProvider.openai);

  const backOnA = switchProvider(onB, "openai");
  assert.equal(backOnA.apiKey, "", "key stays cleared coming back");
  assert.deepEqual(
    activePrefs(backOnA),
    { model: "o1-mini", baseUrl: "", temperature: 0.33, maxTokens: 7777, topP: 0.44 },
    "A's custom prefs survive the round trip",
  );
  assert.deepEqual(backOnA.prefsByProvider.openai, a.prefsByProvider.openai, "A's map entry is symmetric");
});

test("switchProvider does not copy a custom baseUrl onto a hosted provider", () => {
  const onCustom: ByokPrefs = {
    ...stateFor("custom", ""),
    prefsByProvider: {
      custom: { model: "llama3.1", baseUrl: "http://localhost:11434/v1", temperature: 0.2, maxTokens: 1024, topP: 0.9 },
    },
  };

  const onOpenai = switchProvider(onCustom, "openai");
  assert.equal(activePrefs(onOpenai).baseUrl, "", "hosted provider starts with an empty baseUrl");
  assert.deepEqual(onOpenai.prefsByProvider.openai, defaultPrefsFor("openai"));

  // ...and coming back to custom restores the endpoint exactly.
  assert.equal(activePrefs(switchProvider(onOpenai, "custom")).baseUrl, "http://localhost:11434/v1");
});

test("setActivePrefs writes through to prefsByProvider across a switch away and back", () => {
  const start = stateFor("openai", "sk-openai-KEY");
  const patched = setActivePrefs(start, { model: "my-own-model", temperature: 0.7 });

  assert.deepEqual(patched.prefsByProvider.openai, {
    model: "my-own-model",
    baseUrl: "",
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.95,
  });
  assert.deepEqual(activePrefs(patched), patched.prefsByProvider.openai, "active slot mirrors the map");

  const away = switchProvider(patched, "gemini");
  assert.equal(activePrefs(away).model, defaultPrefsFor("gemini").model, "gemini is unaffected");

  const back = switchProvider(away, "openai");
  assert.deepEqual(
    activePrefs(back),
    { model: "my-own-model", baseUrl: "", temperature: 0.7, maxTokens: 4096, topP: 0.95 },
    "the patch survives switching away and back",
  );
});

test("setActivePrefs without a model leaves the manual-edit markers alone", () => {
  const manual = setActivePrefs(stateFor("openai"), { model: "typed-by-hand" });
  const warmed = setActivePrefs(manual, { temperature: 0.11 });

  assert.equal(warmed.manualModelEdit, true, "the earlier manual edit is not cleared");
  assert.equal(warmed.manualEditSeq, manual.manualEditSeq, "seq is not bumped by a non-model patch");
});

test("applyFetchedModels adopts models[0] only when the model was not hand-typed", () => {
  const start = stateFor("openai");
  const fetched = applyFetchedModels(start, ["a", "b"]);
  assert.equal(activePrefs(fetched).model, "a", "model becomes models[0]");
  assert.equal(fetched.manualModelEdit, false, "a fetched model is not a manual edit");
  assert.equal(fetched.manualEditSeq, start.manualEditSeq, "seq is not bumped");
  assert.equal(fetched.prefsByProvider.openai?.model, "a", "written back into the map");
});

test("applyFetchedModels is a no-op once the model was hand-typed, without mutating the input", () => {
  const input = setActivePrefs(stateFor("openai"), { model: "my-own-model" });
  const snapshot = JSON.parse(JSON.stringify(input)) as ByokPrefs;

  const result = applyFetchedModels(input, ["x", "y"]);

  assert.deepEqual(result, input, "state is returned unchanged");
  assert.equal(result, input, "the very same object is returned (no rebuild)");
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot, "the input was not mutated");
  assert.equal(activePrefs(result).model, "my-own-model", "the typed model wins over the fetch");
});

test("applyFetchedModels ignores an empty list and an already-present model", () => {
  const start = stateFor("openai");
  assert.equal(applyFetchedModels(start, []), start, "empty list is a no-op");
  assert.equal(applyFetchedModels(start, ["gpt-4o-mini", "gpt-4o"]), start, "current model already present");
});

test("a stale fetchModels response cannot clobber a hand-typed model", () => {
  // openai, load the model list -> adopts "a"
  let state = stateFor("openai");
  state = applyFetchedModels(state, ["a", "b"]);
  assert.equal(activePrefs(state).model, "a");

  // ...the user types their own model while a second fetch is still in flight.
  const seqBefore = state.manualEditSeq;
  state = setActivePrefs(state, { model: "my-own-model" });
  assert.equal(state.manualModelEdit, true);
  assert.equal(state.manualEditSeq, seqBefore + 1);

  // ...the in-flight fetch resolves and is ignored.
  state = applyFetchedModels(state, ["x", "y"]);
  assert.equal(activePrefs(state).model, "my-own-model", "typed model survives the late response");
  assert.equal(state.prefsByProvider.openai?.model, "my-own-model", "the map agrees");
});

test("manualEditSeq strictly increases across manual edits", () => {
  let state = stateFor("openai");
  const seen: number[] = [state.manualEditSeq];
  for (const model of ["first", "second", "third"]) {
    state = setActivePrefs(state, { model });
    seen.push(state.manualEditSeq);
  }
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `seq increases: ${seen[i - 1]} -> ${seen[i]}`);
  }
});

test("serialize after a switch never contains the previous provider's key", () => {
  const withKey = stateFor("openai", "sk-ant-SECRETVALUE");
  assert.ok(serialize(withKey).includes("SECRETVALUE"), "sanity: the key is persisted while active");

  const switched = switchProvider(withKey, "anthropic");
  assert.equal(switched.apiKey, "", "apiKey is cleared");
  const serialized = serialize(switched);
  assert.equal(serialized.includes("SECRETVALUE"), false, "the old key is nowhere in the payload");
  assert.equal(
    deserialize(serialized)?.apiKey,
    "",
    "and a round trip through storage does not resurrect it",
  );
});