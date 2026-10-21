/**
 * lib/sessions-list.ts — keyset (cursor) pagination for the history list.
 *
 * `OFFSET` pagination is not used anywhere here on purpose: it silently skips or
 * repeats rows whenever the underlying table changes between two page requests,
 * and it degrades linearly because SQLite still has to materialise every skipped
 * row. Keyset pagination anchors each page on the LAST ROW OF THE PREVIOUS PAGE
 * and asks SQLite for "everything strictly after that row in sort order", so the
 * work per page stays flat and rows are never double-counted.
 *
 * Two properties make that work, and both are load-bearing:
 *
 *   1. Every sort ends with `s.id DESC` as a tie-breaker. Without it, rows that
 *      share a sort key have no defined relative order, so a page boundary landing
 *      inside a tie group would drop or repeat them.
 *   2. The cursor predicate is the row-value form `(sort_key, s.id) < (?, ?)`,
 *      which is *exactly* the negation of the `ORDER BY sort_key DESC, s.id DESC`
 *      it pages. Duplicating the sort expression in two places is intentional —
 *      the two must stay byte-identical or rows leak across the boundary.
 *
 * NOTE on `duration`: the key is `COALESCE(ended_at, created_at) - created_at`, so
 * an unfinished session gets exactly 0 rather than `now - created_at`. That is
 * deliberate on two counts. Mechanically, a clock-derived key would break this
 * whole module: every active row's key would tick upward between two page
 * requests, so a row sitting one second below the page boundary would be skipped
 * forever the moment the user paused on page 1. Semantically, an interview that
 * has not ended has no duration yet, and 0 puts it last in a "longest first" sort
 * instead of letting a three-day-old abandoned session sit at the very top.
 */
import { query } from "./db";
import type { SessionRow } from "./types";

export interface ListInput {
  provider: string; // 'all' means no filter
  status: string;
  mode: string;
  q: string; // already trimmed
  sort: "newest" | "score" | "duration" | string;
  limit: number; // 1..100, already clamped
  cursor: string | null; // opaque from previous response, or null for first page
}

export interface ListOutput {
  sessions: SessionRow[]; // existing columns plus overall_score, recommendation, evaluated_turns
  nextCursor: string | null; // opaque to client, encode JSON; null when hasMore=false
  hasMore: boolean;
  limit: number;
}

/** The three values carried by an opaque cursor. Never expose the shape itself. */
export interface Cursor {
  /** Sort-key value of the last row the client already saw. */
  t: number;
  /** Session id of that same row — the tie-breaker. */
  i: string;
  /** Sort the cursor was minted for, so it cannot be replayed against another sort. */
  s: string;
}

const DEFAULT_SORT = "newest";

/**
 * SQL expression producing the sort key. Used verbatim in BOTH the ORDER BY and
 * the cursor predicate — see the note at the top of this file.
 */
const SORT_KEY_SQL: Readonly<Record<string, string>> = {
  newest: "s.created_at",
  // overall_score is a 0..100 integer, so mapping NULL to -1 lands unscored
  // sessions last under a DESC sort (and matches the cursor predicate).
  score: "COALESCE(e.overall_score, -1)",
  duration: "(COALESCE(s.ended_at, s.created_at) - s.created_at)",
};

/** Unknown sort names fall back to `newest` for ordering but keep their identity
 *  in the cursor, so a client cannot silently switch sorts mid-walk. */
function sortKeySql(sort: string): string {
  return Object.prototype.hasOwnProperty.call(SORT_KEY_SQL, sort) ? SORT_KEY_SQL[sort] : SORT_KEY_SQL[DEFAULT_SORT];
}

/**
 * Mirror of the SQL sort key, evaluated on a returned row. This is what gets
 * encoded into the next cursor, so a mismatch here would drop/duplicate rows.
 */
function sortKeyOf(sort: string, row: SessionRow): number {
  if (sort === "score") return row.overall_score ?? -1;
  if (sort === "duration") return (row.ended_at ?? row.created_at) - row.created_at;
  return row.created_at;
}

export function encodeCursor(c: { t: number; i: string; s: string }): string {
  return Buffer.from(JSON.stringify({ t: c.t, i: c.i, s: c.s }), "utf8").toString("base64url");
}

/**
 * Every failure mode — bad base64url, bad JSON, wrong shape, wrong field types —
 * collapses to `null`. Callers treat `null` as "no cursor", i.e. first page. A
 * malformed cursor must never be able to turn into a 500, and must never be
 * able to smuggle a sort through the `s` check below.
 */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.t !== "number" || !Number.isFinite(o.t)) return null;
    if (typeof o.i !== "string" || o.i.length === 0) return null;
    if (typeof o.s !== "string") return null;
    return { t: o.t, i: o.i, s: o.s };
  } catch {
    return null;
  }
}

export function listSessions(input: ListInput): ListOutput {
  const provider = input.provider || "all";
  const status = input.status || "all";
  const mode = input.mode || "all";
  const q = input.q ?? "";
  const sort = input.sort || DEFAULT_SORT;
  // Defensive re-clamp: the route already clamps, but a LIMIT of 0 would make
  // `rows[limit - 1]` undefined and crash the cursor mint.
  const rawLimit = Math.floor(Number(input.limit));
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;

  const key = sortKeySql(sort);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (provider !== "all") { clauses.push("s.provider = ?"); params.push(provider); }
  if (status !== "all") { clauses.push("s.status = ?"); params.push(status); }
  if (mode !== "all") { clauses.push("s.mode = ?"); params.push(mode); }
  if (q) { clauses.push("(s.id LIKE ? OR s.role LIKE ? OR s.cv_filename LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  // A cursor is only honoured when it decodes AND was minted for this exact sort.
  // Anything else is treated as "first page" rather than an error, so a stale or
  // hand-edited cursor degrades to a full first page instead of a 500.
  const cursor = input.cursor === null || input.cursor === undefined ? null : decodeCursor(input.cursor);
  if (cursor && cursor.s === sort) {
    clauses.push(`(${key}, s.id) < (?, ?)`);
    params.push(cursor.t, cursor.i);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  // One extra row tells us whether another page exists without a second query.
  const rows = query<SessionRow>(
    `SELECT s.*, e.overall_score, e.recommendation,
      (SELECT COUNT(*) FROM message_turns m WHERE m.session_id = s.id AND m.role = 'user') AS evaluated_turns
     FROM sessions s
     LEFT JOIN evaluations e ON e.session_id = s.id
     ${where}
     ORDER BY ${key} DESC, s.id DESC
     LIMIT ?`,
    [...params, limit + 1],
  );

  const hasMore = rows.length > limit;
  const sessions = hasMore ? rows.slice(0, limit) : rows;
  const last = sessions[sessions.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ t: sortKeyOf(sort, last), i: last.id, s: sort }) : null;

  return { sessions, nextCursor, hasMore, limit };
}