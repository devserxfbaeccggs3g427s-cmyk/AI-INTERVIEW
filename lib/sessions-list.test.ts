/**
 * lib/sessions-list.test.ts — keyset pagination for the history list (T-05.1).
 *
 * Everything here runs against a throwaway SQLite file in a tempdir: the env var
 * is set at module scope, BEFORE the dynamic `import("./db")` in `before()`,
 * because lib/db.ts resolves its path at module-evaluation time. The real
 * data/interview_sessions.db is never opened.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const dir = mkdtempSync(join(tmpdir(), "sessions-list-"));
process.env.INTERVIEW_DB_PATH = join(dir, "list.db");
process.env.PUBLIC_ORIGIN = "https://interview.example.com";

// lib/sessions-list.ts must never pull "server-only" into a graph that does not
// have it (same trick as sessions-create.test.ts).
type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
};

type DbModule = typeof import("./db");
type ListModule = typeof import("./sessions-list");
type RouteModule = typeof import("../app/api/sessions/route");

let db: DbModule;
let list: ListModule;
let route: RouteModule;

before(async () => {
    [db, list, route] = await Promise.all([
        import("./db"),
        import("./sessions-list"),
        import("../app/api/sessions/route"),
    ]);
});

after(() => {
    loader._load = originalLoad;
    if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
    else process.env.INTERVIEW_DB_PATH = previousDb;
    if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previousOrigin;
    rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
    db.exec("DELETE FROM evaluation_attempts");
    db.exec("DELETE FROM evaluations");
    db.exec("DELETE FROM cv_extracts");
    db.exec("DELETE FROM message_turns");
    db.exec("DELETE FROM sessions");
    db.exec("DELETE FROM model_configs");
});

/* ---------- seeding helpers ---------- */

const BASE_EPOCH = 1_700_000_000;

function sid(i: number): string {
    return `sess_n${String(i).padStart(3, "0")}`;
}

interface SeedRow {
    id: string;
    role?: string;
    mode?: "strict" | "coaching";
    provider?: string;
    status?: "active" | "evaluating" | "completed" | "failed";
    created_at: number;
    ended_at?: number | null;
    cv_filename?: string | null;
    /** Omit for "no evaluation row at all". */
    score?: number | null;
    /** Number of `user` message_turns to create (drives evaluated_turns). */
    turns?: number;
}

function seed(rows: SeedRow[]): void {
    for (const r of rows) {
        db.exec(
            `INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status, created_at, ended_at, cv_filename)
             VALUES (?, ?, 'en', ?, 5, ?, 'test-model', ?, ?, ?, ?)`,
            [
                r.id,
                r.role ?? "Backend Engineer",
                r.mode ?? "strict",
                r.provider ?? "openai",
                r.status ?? "completed",
                r.created_at,
                r.ended_at === undefined ? r.created_at + 60 : r.ended_at,
                r.cv_filename ?? null,
            ],
        );
        if (r.score !== undefined && r.score !== null) {
            db.exec(
                `INSERT INTO evaluations (session_id, report_json, overall_score, recommendation)
                 VALUES (?, '{}', ?, 'hire')`,
                [r.id, r.score],
            );
        }
        for (let t = 1; t <= (r.turns ?? 0); t++) {
            db.exec(
                `INSERT INTO message_turns (session_id, turn_number, role, content) VALUES (?, ?, 'user', 'a')`,
                [r.id, t],
            );
        }
    }
}

/** The 120-row fixture shared by the ">100 sessions" and filter tests. */
function seed120(): void {
    const completed = new Set([7, 23, 58, 91, 110]);
    seed(
        Array.from({ length: 120 }, (_, i) => ({
            id: sid(i),
            // Exactly the first 7 roles contain "Rust" — the `q` fixture.
            role: i < 7 ? `Rust Engineer #${i}` : `Backend Engineer #${i}`,
            status: (completed.has(i) ? "completed" : "active") as "completed" | "active",
            // Deliberately duplicated: every timestamp is shared by two rows so
            // the tie-breaker is exercised on every single page boundary.
            created_at: BASE_EPOCH + Math.floor(i / 2),
            ended_at: completed.has(i) ? BASE_EPOCH + Math.floor(i / 2) + 30 : null,
        })),
    );
}

/** Walks every page via nextCursor and returns the pages plus the flattened ids. */
function walk(overrides: Partial<Parameters<ListModule["listSessions"]>[0]> & { limit: number }) {
    const pages: ReturnType<ListModule["listSessions"]>[] = [];
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 100; guard++) {
        const page = list.listSessions({
            provider: "all",
            status: "all",
            mode: "all",
            q: "",
            sort: "newest",
            ...overrides,
            cursor,
        });
        pages.push(page);
        ids.push(...page.sessions.map((s) => s.id));
        if (!page.hasMore) {
            assert.equal(page.nextCursor, null, "last page must not advertise a cursor");
            return { pages, ids };
        }
        assert.ok(page.nextCursor, "hasMore=true must always carry a cursor");
        cursor = page.nextCursor;
    }
    throw new Error("pagination did not terminate");
}

/** Descending-key, descending-id reference ordering used to check every sort. */
function expectedOrder(rows: Array<{ id: string; key: number }>): string[] {
    return [...rows]
        .sort((a, b) => b.key - a.key || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .map((r) => r.id);
}

/* ---------- (a) cursor codec ---------- */

test("encodeCursor/decodeCursor round-trips realistic values", () => {
    for (const c of [
        { t: 1_700_000_000, i: "sess_n0007", s: "newest" },
        { t: 0, i: "sess_zzzzzzzzzzzzzzzz", s: "score" },
        { t: -1, i: "a", s: "duration" },
        { t: 100, i: "sess_é✓", s: "newest" }, // non-ASCII must survive utf8
    ]) {
        assert.deepEqual(list.decodeCursor(list.encodeCursor(c)), c);
    }
});

test("encodeCursor emits base64url (no +, / or =) of JSON", () => {
    const raw = list.encodeCursor({ t: 42, i: "sess_?~", s: "score" });
    assert.match(raw, /^[A-Za-z0-9_-]+$/, "cursor must be base64url");
    assert.deepEqual(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")), {
        t: 42,
        i: "sess_?~",
        s: "score",
    });
});

test("decodeCursor returns null for every malformed shape (never throws)", () => {
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
    const cases: Array<[string, string]> = [
        ["non-base64url garbage", "@@@not-a-cursor@@@"],
        ["empty string", ""],
        ["base64url of 'not json'", b64("not json")],
        ["base64url of '{}' (missing fields)", b64("{}")],
        ["base64url of wrong field types", b64(JSON.stringify({ t: "x", i: 1, s: "newest" }))],
        ["JSON array instead of object", b64("[1,2,3]")],
        ["JSON null", b64("null")],
        ["JSON number", b64("7")],
        ["empty session id", b64(JSON.stringify({ t: 1, i: "", s: "newest" }))],
        ["non-finite t", b64(JSON.stringify({ t: "NaN", i: "a", s: "newest" }))],
        ["missing sort key", b64(JSON.stringify({ t: 1, i: "a" }))],
    ];
    for (const [name, raw] of cases) {
        assert.equal(list.decodeCursor(raw), null, `${name} must decode to null`);
    }
});

/* ---------- (i) empty database ---------- */

test("empty database: empty page, no cursor, hasMore=false, limit echoed", () => {
    const out = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 50, cursor: null,
    });
    assert.deepEqual(out, { sessions: [], nextCursor: null, hasMore: false, limit: 50 });
});

/* ---------- (c) >100 sessions, duplicates ---------- */

test("120 sessions: forward walk visits every row exactly once, hasMore flips on the last page", () => {
    seed120();
    const { pages, ids } = walk({ limit: 25 });

    assert.equal(ids.length, 120);
    assert.equal(new Set(ids).size, 120, "no row may appear on two pages");
    assert.deepEqual(ids, [...ids].sort((a, b) => (a < b ? 1 : -1)));

    // 120 rows at limit 25 => four full pages then a 20-row tail.
    assert.equal(pages.length, 5);
    assert.deepEqual(pages.slice(0, 4).map((p) => p.hasMore), [true, true, true, true]);
    assert.equal(pages[4].hasMore, false);
    assert.equal(pages[4].sessions.length, 20);
    assert.equal(pages[4].nextCursor, null);
    // The page size never leaks the +1 look-ahead row.
    assert.deepEqual(pages.map((p) => p.sessions.length), [25, 25, 25, 25, 20]);
    assert.ok(pages.every((p) => p.limit === 25));
});

test("120 sessions: duplicate created_at values are ordered by id DESC within each tie", () => {
    seed120();
    const { ids } = walk({ limit: 25 });

    const expected = Array.from({ length: 120 }, (_, i) => sid(i))
        // created_at DESC groups 2k+1 with 2k; id DESC puts the odd index first.
        .sort((a, b) => (a < b ? 1 : -1));
    assert.deepEqual(ids, expected);

    // Every adjacent pair inside a page boundary must respect the tie-break.
    const rows = ids.map((id) => db.queryOne<{ id: string; created_at: number }>(
        "SELECT id, created_at FROM sessions WHERE id = ?", [id],
    )!);
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const cur = rows[i];
        assert.ok(
            prev.created_at > cur.created_at || (prev.created_at === cur.created_at && prev.id > cur.id),
            `row ${i} out of order`,
        );
    }
    assert.equal(new Set(rows.map((r) => r.created_at)).size, 60, "fixture must contain 60 duplicate pairs");
});

/* ---------- (d) each sort ---------- */

test("sort=newest: 35 sessions with duplicates, cursor skips forward without repeats", () => {
    seed(Array.from({ length: 35 }, (_, i) => ({ id: sid(i), created_at: BASE_EPOCH + Math.floor(i / 3) })));
    const expected = expectedOrder(
        Array.from({ length: 35 }, (_, i) => ({ id: sid(i), key: BASE_EPOCH + Math.floor(i / 3) })),
    );

    const { pages, ids } = walk({ sort: "newest", limit: 8 });
    assert.deepEqual(ids, expected);
    assert.equal(new Set(ids).size, 35);
    assert.deepEqual(pages.map((p) => p.sessions.length), [8, 8, 8, 8, 3]);
    assert.deepEqual(pages.map((p) => p.hasMore), [true, true, true, true, false]);
});

test("sort=score: 30 sessions, 5 without an evaluation sort AFTER the scored ones", () => {
    // Indices 0..24 carry scores 50..54 in cycles (lots of ties); 25..29 have no
    // evaluations row at all, i.e. overall_score IS NULL.
    seed(Array.from({ length: 30 }, (_, i) => ({
        id: sid(i),
        created_at: BASE_EPOCH + i,
        ...(i < 25 ? { score: 50 + (i % 5) } : {}),
    })));

    const expected = expectedOrder(
        Array.from({ length: 30 }, (_, i) => ({ id: sid(i), key: i < 25 ? 50 + (i % 5) : -1 })),
    );

    const { pages, ids } = walk({ sort: "score", limit: 7 });
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    assert.deepEqual(ids, expected);

    // The five unscored sessions are the tail of every page walk, id DESC.
    const unscored = Array.from({ length: 5 }, (_, k) => sid(25 + k)).sort((a, b) => (a < b ? 1 : -1));
    assert.deepEqual(ids.slice(-5), unscored);
});

test("sort=duration: 30 sessions, 3 still active (ended_at NULL) sort AFTER the finished ones", () => {
    // Finished interviews: created in the deep past with large, unique durations
    // (>= 100000). Active ones have NO duration yet — the key is
    // `COALESCE(ended_at, created_at) - created_at`, i.e. exactly 0 — so they
    // sort last and their key never moves.
    seed([
        ...Array.from({ length: 27 }, (_, i) => ({
            id: sid(i),
            created_at: 1_600_000_000,
            ended_at: 1_600_000_000 + 100_000 + i, // duration 100000 + i
            status: "completed" as const,
        })),
        ...Array.from({ length: 3 }, (_, k) => ({
            id: sid(27 + k),
            // Deliberately ancient: an abandoned session must not outrank a
            // finished 100000s interview just because the wall clock kept moving.
            created_at: 1_600_000_000 - 90_000,
            ended_at: null,
            status: "active" as const,
        })),
    ]);

    // limit=10 lands a page boundary inside the finished group AND the final
    // boundary inside the tied-zero group, so this walk exercises the tie-breaker
    // on both ends rather than parking the hard rows on the last page.
    const { pages, ids } = walk({ sort: "duration", limit: 10 });
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    assert.deepEqual(pages.map((p) => p.sessions.length), [10, 10, 10]);
    assert.deepEqual(pages.map((p) => p.hasMore), [true, true, false]);

    // 27 finished, longest first (index 26 down to 0), then the three actives.
    assert.deepEqual(ids, [
        ...Array.from({ length: 27 }, (_, k) => sid(26 - k)),
        sid(29), sid(28), sid(27),
    ]);

    const durations = ids.map((id) => db.queryOne<{ d: number }>(
        "SELECT (COALESCE(ended_at, created_at) - created_at) d FROM sessions WHERE id = ?", [id],
    )!.d);
    for (let i = 1; i < durations.length; i++) {
        assert.ok(durations[i - 1] >= durations[i], `duration order broken at ${i}`);
    }
});

test("sort=duration: the key of an unfinished session is stable across a walk", () => {
    // The bug this pins: with `COALESCE(ended_at, unixepoch())` every active row's
    // key ticks upward once per second. A row sitting one second below the page
    // boundary would therefore be skipped forever as soon as the user paused on
    // page 1 before clicking Next. Re-walking after a delay must return the same
    // set, because no key depends on the wall clock.
    seed([
        // Boundary row on page 1 is `sid(9)` (duration 9). `sid(8)` sits one
        // below it and is the row a clock-derived key would lose.
        ...Array.from({ length: 20 }, (_, i) => ({
            id: sid(i),
            created_at: 1_600_000_000,
            ended_at: 1_600_000_000 + 19 - i, // duration 19..0
            status: "completed" as const,
        })),
        ...Array.from({ length: 5 }, (_, k) => ({
            id: sid(20 + k),
            created_at: 1_600_000_000,
            ended_at: null,
            status: "active" as const,
        })),
    ]);

    const walkOnce = () => walk({ sort: "duration", limit: 10 }).ids;
    const first = walkOnce();
    // Busy-wait past a wall-clock second so any `unixepoch()` key would differ.
    const until = Math.floor(Date.now() / 1000) + 1;
    while (Math.floor(Date.now() / 1000) < until) { /* spin */ }
    const second = walkOnce();

    assert.equal(first.length, 25);
    assert.equal(new Set(first).size, 25);
    assert.deepEqual(second, first, "a second walk over unchanged data must be identical");
    assert.ok(first.includes(sid(8)), "the row one second below the boundary must survive");
    // Six rows tie at duration 0 — sid(19) finished instantly, the five actives
    // have no duration yet — so the tail is decided purely by the id tie-breaker.
    assert.deepEqual(
        first.slice(-6),
        [sid(24), sid(23), sid(22), sid(21), sid(20), sid(19)],
    );
});

/* ---------- (e) filters compose with the cursor ---------- */

test("status filter composes with the cursor: only the 5 completed sessions come back", () => {
    seed120();
    const { pages, ids } = walk({ status: "completed", limit: 2 });

    assert.deepEqual(ids, [sid(110), sid(91), sid(58), sid(23), sid(7)]);
    assert.equal(ids.length, 5);
    assert.deepEqual(pages.map((p) => p.sessions.length), [2, 2, 1]);
    assert.deepEqual(pages.map((p) => p.hasMore), [true, true, false]);
    for (const page of pages) {
        for (const row of page.sessions) {
            const stored = db.queryOne<{ status: string }>("SELECT status FROM sessions WHERE id = ?", [row.id])!;
            assert.equal(stored.status, "completed");
        }
    }
});

test("provider + mode filters compose with the cursor", () => {
    seed(Array.from({ length: 12 }, (_, i) => ({
        id: sid(i),
        created_at: BASE_EPOCH + i,
        provider: i % 2 === 0 ? "openai" : "gemini",
        mode: (i % 3 === 0 ? "strict" : "coaching") as "strict" | "coaching",
    })));

    const { ids } = walk({ provider: "gemini", mode: "coaching", limit: 2 });
    // gemini AND coaching => odd i not divisible by 3 => 1, 5, 7, 11
    assert.deepEqual(ids, [sid(11), sid(7), sid(5), sid(1)]);
});

/* ---------- (f) search composes with the cursor ---------- */

test("q search composes with the cursor: exactly the 7 matching rows, across pages", () => {
    seed120();
    const { pages, ids } = walk({ q: "Rust", limit: 3 });

    assert.deepEqual(ids, [sid(6), sid(5), sid(4), sid(3), sid(2), sid(1), sid(0)]);
    assert.deepEqual(pages.map((p) => p.sessions.length), [3, 3, 1]);
    assert.deepEqual(pages.map((p) => p.hasMore), [true, true, false]);
    for (const id of ids) {
        const row = db.queryOne<{ role: string }>("SELECT role FROM sessions WHERE id = ?", [id])!;
        assert.match(row.role, /Rust/);
    }
});

/* ---------- (g) hostile / out-of-range cursors ---------- */

test("reversed cursor (t=0) yields an empty, well-formed page — no crash, no 500", () => {
    seed120();
    const out = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25,
        cursor: list.encodeCursor({ t: 0, i: "zzzz", s: "newest" }),
    });
    // Everything sorts strictly after (0, 'zzzz'), so the page is legitimately
    // empty. Documented choice: an out-of-range cursor is honoured, not reset.
    assert.deepEqual(out, { sessions: [], nextCursor: null, hasMore: false, limit: 25 });
});

test("cursor past the far end of the set returns exactly the first page", () => {
    seed120();
    const first = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25, cursor: null,
    });
    const beyond = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25,
        cursor: list.encodeCursor({ t: Number.MAX_SAFE_INTEGER, i: "zzzz", s: "newest" }),
    });
    assert.deepEqual(beyond.sessions.map((s) => s.id), first.sessions.map((s) => s.id));
    assert.equal(beyond.hasMore, true);
});

test("malformed cursor and foreign-sort cursor both degrade to the first page", () => {
    seed120();
    const base = {
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25, cursor: null,
    };
    const first = list.listSessions(base);

    // Same sort, garbage payload.
    for (const raw of ["", "%%%", "not-a-cursor", Buffer.from("{}", "utf8").toString("base64url")]) {
        const out = list.listSessions({ ...base, cursor: raw });
        assert.deepEqual(out.sessions.map((s) => s.id), first.sessions.map((s) => s.id), `cursor ${JSON.stringify(raw)}`);
        assert.equal(out.nextCursor, first.nextCursor);
    }

    // A perfectly valid "score" cursor replayed against sort=newest must not be
    // applied — that is the whole point of carrying `s` in the cursor.
    const foreign = list.encodeCursor({ t: 50, i: sid(0), s: "score" });
    const replayed = list.listSessions({ ...base, cursor: foreign });
    assert.deepEqual(replayed.sessions.map((s) => s.id), first.sessions.map((s) => s.id));
    assert.equal(replayed.nextCursor, first.nextCursor);
});

/* ---------- (h) cursor idempotence ---------- */

test("a cursor is idempotent: applying it twice returns the identical page", () => {
    seed120();
    const input = {
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25, cursor: null,
    };
    const first = list.listSessions(input);
    assert.ok(first.nextCursor);

    const a = list.listSessions({ ...input, cursor: first.nextCursor });
    const b = list.listSessions({ ...input, cursor: first.nextCursor });
    assert.deepEqual(b, a, "the cursor must not advance when it is consumed");
    assert.equal(a.sessions.length, 25);
    assert.equal(new Set(a.sessions.map((s) => s.id)).size, 25, "page 2 must not repeat page 1 rows");
    for (const row of a.sessions) {
        assert.ok(!first.sessions.some((s) => s.id === row.id), "no overlap between page 1 and page 2");
    }

    // And walking with it does land on page 2 of a fresh walk.
    const { pages } = walk({ limit: 25 });
    assert.deepEqual(pages[1].sessions.map((s) => s.id), a.sessions.map((s) => s.id));
});

test("cursor survives URL round-trip (base64url has no reserved URL characters)", () => {
    seed120();
    const first = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25, cursor: null,
    });
    assert.ok(first.nextCursor);
    const url = new URL(`https://example.test/api/sessions?cursor=${encodeURIComponent(first.nextCursor)}`);
    const second = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 25, cursor: url.searchParams.get("cursor"),
    });
    assert.equal(second.sessions.length, 25);
    assert.deepEqual(second.sessions.map((s) => s.id), walk({ limit: 25 }).pages[1].sessions.map((s) => s.id));
});

/* ---------- SELECT contract ---------- */

test("rows keep overall_score/recommendation/evaluated_turns and the LEFT JOIN semantics", () => {
    seed([
        { id: sid(0), created_at: BASE_EPOCH, score: 88, turns: 3 },
        { id: sid(1), created_at: BASE_EPOCH + 1 }, // no evaluation row
    ]);
    const out = list.listSessions({
        provider: "all", status: "all", mode: "all", q: "",
        sort: "newest", limit: 50, cursor: null,
    });
    assert.equal(out.sessions.length, 2);

    const scored = out.sessions.find((s) => s.id === sid(0))!;
    assert.equal(scored.overall_score, 88);
    assert.equal(scored.recommendation, "hire");
    assert.equal(scored.evaluated_turns, 3, "evaluated_turns subselect must survive");

    const unscored = out.sessions.find((s) => s.id === sid(1))!;
    assert.equal(unscored.overall_score, null);
    assert.equal(unscored.recommendation, null);
    assert.equal(unscored.evaluated_turns, 0);
});

/* ---------- route wrapper contract ---------- */

test("GET /api/sessions returns the backward-compatible envelope plus pagination fields", async () => {
    seed120();
    const res = await route.GET(new Request("https://interview.example.com/api/sessions?limit=25"));
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(Array.isArray(json.sessions), "history UI reads j.sessions");
    assert.equal(json.sessions.length, 25);
    assert.equal(json.limit, 25);
    assert.equal(json.hasMore, true);
    assert.equal(typeof json.nextCursor, "string");

    const res2 = await route.GET(
        new Request(`https://interview.example.com/api/sessions?limit=25&cursor=${encodeURIComponent(json.nextCursor)}`),
    );
    const json2 = await res2.json();
    assert.equal(json2.sessions.length, 25);
    const page1 = new Set<string>(json.sessions.map((s: { id: string }) => s.id));
    for (const row of json2.sessions) {
        assert.ok(!page1.has(row.id), "page 2 must not repeat page 1 rows");
    }
});

test("GET /api/sessions clamps limit and ignores a garbage limit", async () => {
    seed120();
    const read = async (qs: string) => (await (await route.GET(
        new Request(`https://interview.example.com/api/sessions?${qs}`),
    )).json());

    const big = await read("limit=5000");
    assert.equal(big.limit, 100);
    assert.equal(big.sessions.length, 100);

    const small = await read("limit=0");
    assert.equal(small.limit, 1);
    assert.equal(small.sessions.length, 1);

    const nan = await read("limit=abc");
    assert.equal(nan.limit, 50);
    assert.equal(nan.sessions.length, 50);
    assert.equal(nan.hasMore, true);

    // Unknown sort falls back to newest ordering but still paginates.
    const weird = await read("sort=does-not-exist&limit=10");
    assert.equal(weird.sessions.length, 10);
    assert.equal(weird.hasMore, true);
});