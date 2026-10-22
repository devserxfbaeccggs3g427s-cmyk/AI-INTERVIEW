import type { SessionRow } from "./types-shared";
import type { EvaluationReport } from "./zod-schemas";

/** Never offer actions for a report once its session is no longer completed or its refresh failed. */
export function visibleReport(
  status: SessionRow["status"] | undefined,
  report: EvaluationReport | null,
  error: string | null,
): EvaluationReport | null {
  return status === "completed" && !error ? report : null;
}
