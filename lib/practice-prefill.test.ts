import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePracticePrefill, encodePracticePrefill, practiceFocusLabel } from "./practice-prefill";

test("short URI contains only the three allowed fields, and round-trips unicode", () => {
  const input = { role: "Kỹ sư Backend", language: "vi" as const, focus: ["Caching & consistency", "Kiểm thử"] };
  const url = encodePracticePrefill(input);
  if (!url) throw new Error("Expected a valid practice URL");
  assert.ok(url.startsWith("/new?"));
  assert.deepEqual(decodePracticePrefill(url.slice("/new".length)), input);
  assert.deepEqual([...new URLSearchParams(url.slice("/new?".length)).keys()], ["role", "language", "focus", "focus"]);
  assert.equal(decodePracticePrefill(""), null);
});

test("max-length multibyte focus and role still survive an encoded URL round-trip", () => {
  const input = { role: "界".repeat(120), language: "vi" as const, focus: ["界".repeat(120), "界".repeat(120), "界".repeat(120)] };
  const url = encodePracticePrefill(input);
  assert.ok(url);
  assert.ok(url.length > 1024);
  assert.deepEqual(decodePracticePrefill(url.slice("/new".length)), input);
});

test("report markup, links, control characters and markdown are stripped before entering the URL", () => {
  const label = practiceFocusLabel("  <img src=x onerror=alert(1)> **Build** [cache](https://evil.test/?apiKey=secret)\n now  ");
  assert.ok(label);
  assert.ok(label.includes("Build"));
  assert.ok(!/[<>\n`*\[\]{}#]/.test(label));
  assert.ok(!label.includes("https:"));
  assert.ok(!label.includes("apiKey"));
  assert.equal(practiceFocusLabel(" "), null);
  assert.equal(practiceFocusLabel({ token: "secret" }), null);
  assert.equal(practiceFocusLabel("X".repeat(500))?.length, 120);
});

test("strict decoder rejects unknown fields, duplicates, invalid encoding, and excessive focus", () => {
  const base = "role=Frontend&language=en&focus=State";
  for (const query of [
    `${base}&cvText=private`, `${base}&apiKey=secret`, `${base}&transcript=private`,
    `${base}&role=Other`, `${base}&language=vi`, `${base}&focus=A&focus=B&focus=C`,
    "role=Frontend&language=fr", "role=X&language=vi", "role=Frontend&language=vi&focus=",
    `role=Frontend&language=vi&focus=${"x".repeat(121)}`,
    `role=${"x".repeat(121)}&language=vi`, "role=Frontend&language=vi&focus=%ZZ",
    "role=Frontend&language=vi&focus=%00", "role=Frontend&language=vi&focus=%FF",
    "role=Frontend&language=vi&focus=line%0Abreak",
    `role=Frontend&language=vi&focus=${"x".repeat(1024)}`, "role=Frontend&language=vi#apiKey=secret",
  ]) {
    assert.equal(decodePracticePrefill(query), null, query);
  }
  assert.equal(encodePracticePrefill({ role: "Frontend", language: "vi", focus: ["x".repeat(121)] }), null);
});

test("query cannot carry CV, key or transcript into the next session", () => {
  const url = encodePracticePrefill({ role: "Engineer", language: "en", focus: ["System design"] });
  assert.ok(url);
  assert.ok(!/cv|key|transcript|sessionId/i.test(url));
  assert.equal(decodePracticePrefill(`${url.slice(5)}&cvDataUrl=private`), null);
});
