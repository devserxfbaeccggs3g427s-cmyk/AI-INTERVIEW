import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleReport } from "./report-visibility";
import type { EvaluationReport } from "./zod-schemas";

test("a failed refresh cannot leave stale report actions visible", () => {
  const previouslyLoadedReport = { improvements: ["Caching"], next_steps: [{ title: "Practice caching" }] } as EvaluationReport;

  assert.equal(visibleReport("completed", previouslyLoadedReport, null), previouslyLoadedReport);
  // A polling response can report failure before the old report state is cleared.
  assert.equal(visibleReport("failed", previouslyLoadedReport, null), null);
  // A refresh error can also leave the last known session status as completed.
  assert.equal(visibleReport("completed", previouslyLoadedReport, "Không tải được báo cáo"), null);
  assert.equal(visibleReport("evaluating", previouslyLoadedReport, null), null);
  assert.equal(visibleReport(undefined, previouslyLoadedReport, null), null);
});
