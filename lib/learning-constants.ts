/** One user action makes at most one bounded provider call. */
export const LEARNING_MAX_TOKENS = 2_500;
export const LEARNING_TIMEOUT_MS = 60_000;
/** Longer than the provider deadline so an active request cannot be stolen. */
export const LEARNING_CLAIM_TTL_MS = 90_000;
export const LEARNING_REQUEST_MAX_BYTES = 4_096;
