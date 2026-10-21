/**
 * Helpers shared between the session UI and the coaching/early-stop state
 * machine. Kept framework-free so a single test file can table-drive the
 * invariants without spinning up React or DOM stubs.
 */

/**
 * Clamp a rubric score to the 0-100 integer band it is always stored in.
 *
 * The server pipeline (`extractCoachingRubric` in `app/api/sessions/[id]/messages/route.ts`)
 * already coerces whatever the model emits into an integer 0..100, but the UI
 * still has to defend against stale hydrated turns, user-provided drafts, or
 * defensive NaN/Infinity values coming through.
 */
export function rubricPercent(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export type EarlyStopOption =
  | "cancel-only"
  | "evaluate-empty"
  | "evaluate-or-finalize-draft"
  | "disabled";

export interface EarlyStopArgs {
  /** Number of *saved* candidate answers, i.e. persisted `user` turns. */
  answeredTurns: number;
  /** Total rounds the session was planned for; used only to gate "draft exists" UI. */
  plannedRounds: number;
  /** Whether the textarea currently holds a non-empty candidate answer. */
  hasDraftAnswer: boolean;
  /** Session status; anything other than `"active"` disables the early-stop UI. */
  sessionStatus: "active" | "evaluating" | "completed" | "failed" | string;
}

/**
 * Decide which early-stop actions to offer the user based on what is currently possible.
 *  - `"cancel-only"`               → 0 answers; offer only DELETE/cancel (no report)
 *  - `"evaluate-empty"`            → ≥1 answers, no draft; offer finalize with already-saved turns
 *  - `"evaluate-or-finalize-draft"` → ≥1 answers AND a draft in the textarea; offer BOTH the
 *                                   "evaluate empty" path AND the "treat draft as final turn" path
 *  - `"disabled"`                  → hidden (no turn pending yet; or session is in evaluating/completed/failed)
 */
export function earlyStopOptions(args: EarlyStopArgs): EarlyStopOption {
  const { answeredTurns, sessionStatus } = args;
  if (sessionStatus !== "active") return "disabled";
  if (answeredTurns <= 0) return "cancel-only";
  if (args.hasDraftAnswer) return "evaluate-or-finalize-draft";
  return "evaluate-empty";
}
