/**
 * Evaluation constants — safe to import from BOTH the server and the browser.
 *
 * These live in their own module because `lib/evaluation.ts` pulls in
 * `node:sqlite` and `node:crypto`, which cannot be bundled into a client
 * component. The session page and the report page both need
 * EVALUATION_STALE_AFTER_MS to decide when to offer "chấm điểm lại", and the
 * value they compare against MUST be the same one the server enforces — a
 * client-side copy that drifts just produces a retry button that races a
 * still-running attempt.
 */

/** Hard ceiling on one provider call for the final report. */
export const EVALUATION_TIMEOUT_MS = 180_000;

/**
 * How long a claim stays valid before another tab or user may steal it.
 * Must stay comfortably above EVALUATION_TIMEOUT_MS: below that, the UI offers
 * a retry while the first attempt is still running, and the two race for the
 * same session.
 */
export const EVALUATION_STALE_AFTER_MS = 240_000;

/**
 * Output-token budgets for the final report, tried in order.
 *
 * These are deliberately NOT derived from the session's `max_tokens`. That
 * value sizes a single interview question; the report is a different shape
 * entirely — four pillars plus one `per_turn` entry per answered round, each
 * with its own micro-rubric — and Vietnamese tokenises at roughly 2 characters
 * per token. Measured on this project's own transcripts, a 3-of-8-round
 * interview already produced a ~6.3k-character report, so the old 4096 ceiling
 * truncated the JSON mid-object and the evaluation failed with no explanation.
 */
export const EVALUATION_MAX_TOKENS = 8_000;
export const EVALUATION_RETRY_MAX_TOKENS = 16_000;
