import assert from "node:assert/strict";
import { test } from "node:test";
import { parseThemePreference, resolveTheme } from "./theme";

test("theme preference defaults to the system and rejects invalid storage values", () => {
  assert.equal(parseThemePreference(null), "system");
  assert.equal(parseThemePreference("system"), "system");
  assert.equal(parseThemePreference("unexpected"), "system");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("light"), "light");
});

test("system tracks the device while manual choices override it", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
