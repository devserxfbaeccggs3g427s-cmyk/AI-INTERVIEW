import assert from "node:assert/strict";
import { test } from "node:test";

import { earlyStopOptions, rubricPercent } from "./scoring";

test("rubricPercent clamps and rounds into the 0-100 integer band", () => {
  const cases: [number, number, string][] = [
    [-5, 0, "below zero clamps to the floor"],
    [0, 0, "zero stays zero"],
    [50, 50, "mid-band stays put"],
    [70, 70, "70 stays 70"],
    [100, 100, "100 stays 100"],
    [110, 100, "above 100 clamps to the ceiling"],
    [73.4, 73, "fractional rounds down"],
    [73.6, 74, "fractional rounds up"],
    [Number.NaN, 0, "NaN becomes 0"],
    [Number.POSITIVE_INFINITY, 100, "Infinity clamps to 100"],
  ];
  for (const [input, expected, label] of cases) {
    assert.equal(rubricPercent(input), expected, `${label} (input=${input})`);
  }
});

test("earlyStopOptions returns cancel-only when no answer has been saved", () => {
  // A draft in the textarea does NOT count; you cannot finalize with 0 saved turns.
  const cases: Parameters<typeof earlyStopOptions>[0][] = [
    { answeredTurns: 0, plannedRounds: 8, hasDraftAnswer: false, sessionStatus: "active" },
    { answeredTurns: 0, plannedRounds: 8, hasDraftAnswer: true, sessionStatus: "active" },
  ];
  for (const args of cases) {
    assert.equal(earlyStopOptions(args), "cancel-only", `args=${JSON.stringify(args)}`);
  }
});

test("earlyStopOptions returns evaluate-empty once ≥1 turn is saved and the textarea is empty", () => {
  const base = { hasDraftAnswer: false, sessionStatus: "active" as const };
  const cases = [
    { ...base, answeredTurns: 3, plannedRounds: 8 },
    { ...base, answeredTurns: 1, plannedRounds: 1 }, // final round already completed
  ];
  for (const args of cases) {
    assert.equal(earlyStopOptions(args), "evaluate-empty", `args=${JSON.stringify(args)}`);
  }
});

test("earlyStopOptions returns evaluate-or-finalize-draft when a draft sits in the textarea", () => {
  const base = { hasDraftAnswer: true, sessionStatus: "active" as const };
  const cases = [
    { ...base, answeredTurns: 3, plannedRounds: 8 },
    { ...base, answeredTurns: 1, plannedRounds: 1 },
  ];
  for (const args of cases) {
    assert.equal(earlyStopOptions(args), "evaluate-or-finalize-draft", `args=${JSON.stringify(args)}`);
  }
});

test("earlyStopOptions is disabled once the session leaves the active state", () => {
  const base = { plannedRounds: 8 };
  for (const status of ["evaluating", "completed", "failed"]) {
    assert.equal(
      earlyStopOptions({ ...base, answeredTurns: 2, hasDraftAnswer: false, sessionStatus: status }),
      "disabled",
      `no draft, status=${status}`,
    );
    assert.equal(
      earlyStopOptions({ ...base, answeredTurns: 2, hasDraftAnswer: true, sessionStatus: status }),
      "disabled",
      `with draft, status=${status}`,
    );
  }
});
