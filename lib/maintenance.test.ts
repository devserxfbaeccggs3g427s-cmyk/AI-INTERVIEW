import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import Module from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {after, before, test} from "node:test";
import {enterMaintenance, enterOperation} from "./maintenance";

const ORIGIN = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const dir = mkdtempSync(join(tmpdir(), "maintenance-test-"));
process.env.INTERVIEW_DB_PATH = join(dir, "isolated.db");
process.env.PUBLIC_ORIGIN = ORIGIN;

type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
};

type DbModule = typeof import("./db");
type SessionRoute = typeof import("../app/api/sessions/route");
type DetailRoute = typeof import("../app/api/sessions/[id]/route");
type MessagesRoute = typeof import("../app/api/sessions/[id]/messages/route");
type EvaluateRoute = typeof import("../app/api/sessions/[id]/evaluate/route");
let db: DbModule;
let sessions: SessionRoute;
let detail: DetailRoute;
let messages: MessagesRoute;
let evaluate: EvaluateRoute;
let providers: typeof import("./providers")["providers"];

before(async () => {
    [db, sessions, detail, messages, evaluate, {providers}] = await Promise.all([
        import("./db"), import("../app/api/sessions/route"),
        import("../app/api/sessions/[id]/route"),
        import("../app/api/sessions/[id]/messages/route"),
        import("../app/api/sessions/[id]/evaluate/route"), import("./providers"),
    ]);
});

after(() => {
    loader._load = originalLoad;
    if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
    else process.env.INTERVIEW_DB_PATH = previousDb;
    if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previousOrigin;
    rmSync(dir, {recursive: true, force: true});
});

function post(url: string, body: unknown, origin = ORIGIN): Request {
    return new Request(`${ORIGIN}/api/${url}`, {
        method: "POST", headers: {origin, "content-type": "application/json", "x-api-key": "test-key"},
        body: JSON.stringify(body),
    });
}

const config = {provider: "openai", model: "test-model"};
const params = (id: string) => ({params: {id}});

function seed(id: string, status = "active"): void {
    db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
    VALUES (?, 'Backend', 'en', 'strict', 5, 'openai', 'test-model', ?)`, [id, status]);
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((fulfill) => {
        resolve = fulfill;
    });
    return {promise, resolve};
}

async function busy(response: Response): Promise<void> {
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match((await response.json()).error, /maintenance/i);
}

test("leases admit concurrent operations, exclude maintenance, and release idempotently", () => {
    const one = enterOperation();
    const two = enterOperation();
    assert.ok(one && two);
    assert.equal(enterMaintenance(), null);
    one();
    one();
    assert.equal(enterMaintenance(), null);
    two();
    const maintenance = enterMaintenance();
    assert.ok(maintenance);
    assert.equal(enterMaintenance(), null);
    assert.equal(enterOperation(), null);
    maintenance();
    maintenance();
    const next = enterOperation();
    assert.ok(next);
    next();
});

test("maintenance denies mutation routes before body and SQLite access, but Origin guard takes precedence", async () => {
    seed("blocked");
    const release = enterMaintenance();
    assert.ok(release);
    try {
        const create = post("sessions", {
            ...config,
            role: "Backend",
            language: "en",
            mode: "strict",
            plannedRounds: 5,
            cvSource: "none"
        });
        Object.defineProperty(create, "json", {
            value: () => {
                throw new Error("body read");
            }
        });
        await busy(await sessions.POST(create));
        assert.equal(create.bodyUsed, false);

        const message = post("sessions/blocked/messages", {...config, answer: ""});
        Object.defineProperty(message, "json", {
            value: () => {
                throw new Error("body read");
            }
        });
        await busy(await messages.POST(message, params("blocked")));
        assert.equal(message.bodyUsed, false);

        const retry = post("sessions/blocked/evaluate", config);
        Object.defineProperty(retry, "json", {
            value: () => {
                throw new Error("body read");
            }
        });
        await busy(await evaluate.POST(retry, params("blocked")));
        assert.equal(retry.bodyUsed, false);

        await busy(await detail.DELETE(new Request(`${ORIGIN}/api/sessions/blocked`, {
            method: "DELETE", headers: {origin: ORIGIN},
        }), params("blocked")));
        assert.ok(db.queryOne("SELECT id FROM sessions WHERE id = 'blocked'"));

        const denied = await sessions.POST(post("sessions", {}, "https://evil.example"));
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get("cache-control"), "private, no-store");
    } finally {
        release();
    }
});

test("session creation retains operation lease across asynchronous request body and releases on errors", async () => {
    const gate = deferred<unknown>();
    const request = post("sessions", {});
    Object.defineProperty(request, "json", {value: () => gate.promise});
    const pending = sessions.POST(request);
    assert.equal(enterMaintenance(), null);
    gate.resolve(null);
    assert.equal((await pending).status, 400);
    const maintenance = enterMaintenance();
    assert.ok(maintenance);
    maintenance();
});

test("PDF creation keeps maintenance out across extraction failure and releases the lease", async () => {
    // Pause the body read immediately before parsing. The lease must already be
    // held and remain held through PDF extraction and any SQLite writes.
    const bodyGate = deferred<unknown>();
    const request = post("sessions", {});
    Object.defineProperty(request, "json", {value: () => bodyGate.promise});
    const pending = sessions.POST(request);
    assert.equal(enterMaintenance(), null);
    try {
        bodyGate.resolve({
            ...config, role: "Backend", language: "en", mode: "strict",
            plannedRounds: 5, cvSource: "pdf", cvDataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
        });
        // The route now awaits extraction; the parser errors on malformed PDF in
        // this direct node:test environment, after the session row is inserted.
        assert.equal(enterMaintenance(), null);
        const response = await pending;
        assert.equal(response.status, 500);
        // Deliberately not asserting the state of the half-created session row:
        // the lease, not that row, is what this test covers.
        const maintenance = enterMaintenance();
        assert.ok(maintenance);
        maintenance();
    } finally {
        bodyGate.resolve(null);
    }
});

function validReport(): string {
    const pillar = {score: 72, headline: "Clear", rationale: "Shows a trade-off", evidence_quote: "consistency"};
    return JSON.stringify({
        schema_version: "v1", overall_score: 72, recommendation: "Hire",
        pillars: {content: pillar, relevance: pillar, clarity: pillar, depth: pillar},
        strengths: ["Strong reasoning"], improvements: ["More metrics"],
        per_turn: [{
            turn_number: 1, topic: "Trade-offs",
            pillar_scores: {content: 72, relevance: 72, clarity: 72, depth: 72},
            micro_rubric: {score: 72, strengths: ["Clear"], improvements: ["Metrics"]},
            standout_quote: "consistency",
        }],
        next_steps: [
            {title: "Read", description: "Study trade-offs", duration: "2 hours"},
            {title: "Practice", description: "Make a prototype", duration: "1 day"},
            {title: "Review", description: "Review the prototype", duration: "30 minutes"},
        ],
        hiring_probability_pct: 65,
    });
}

test("SSE retains lease through generation and persistence, including disconnected clients", async () => {
    seed("streaming");
    const gate = deferred<void>();
    const original = providers.openai.streamChat;
    providers.openai.streamChat = async () => ({
        textStream: (async function* () {
            await gate.promise;
            yield "Tell me about a trade-off.";
        })(),
        meta: Promise.resolve({raw_blocks: {}, latency_ms: 1}),
    });
    try {
        const response = await messages.POST(post("sessions/streaming/messages", {
            ...config,
            answer: ""
        }), params("streaming"));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store, no-transform");
        // The ReadableStream.start callback begins before POST returns. A client
        // cancellation must not release the lock while persistence is unfinished.
        assert.equal(enterMaintenance(), null);
        await response.body!.cancel();
        assert.equal(enterMaintenance(), null);
        gate.resolve();
        let maintenance: (() => void) | null = null;
        for (let tries = 0; tries < 50 && !maintenance; tries++) {
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
            maintenance = enterMaintenance();
        }
        assert.equal(db.queryOne<{
            n: number
        }>("SELECT COUNT(*) n FROM message_turns WHERE session_id = 'streaming'")?.n, 2);
        // close/release follows the persisted writes in stream finally.
        assert.ok(maintenance);
        maintenance();
    } finally {
        gate.resolve();
        providers.openai.streamChat = original;
    }
});

test("final SSE holds lease until evaluation report and audit attempt are committed", async () => {
    seed("final-stream");
    db.exec(`INSERT INTO message_turns (session_id, turn_number, role, content)
    VALUES ('final-stream', 1, 'assistant', 'What trade-off?')`);
    const gate = deferred<void>();
    const entered = deferred<void>();
    const original = providers.openai.streamChat;
    providers.openai.streamChat = async () => {
        entered.resolve();
        await gate.promise;
        return {
            textStream: (async function* () {
                yield validReport();
            })(),
            meta: Promise.resolve({raw_blocks: {}, latency_ms: 1, finish_reason: "stop"}),
        };
    };
    try {
        const response = await messages.POST(post("sessions/final-stream/messages", {
            ...config, answer: "I chose consistency.", finalize: true,
        }), params("final-stream"));
        assert.equal(response.status, 200);
        await entered.promise;
        assert.equal(enterMaintenance(), null);
        assert.equal(db.queryOne<{
            status: string
        }>("SELECT status FROM sessions WHERE id = 'final-stream'")?.status, "evaluating");
        gate.resolve();
        assert.match(await response.text(), /"reason":"complete"/);
        assert.equal(db.queryOne<{
            status: string
        }>("SELECT status FROM sessions WHERE id = 'final-stream'")?.status, "completed");
        assert.equal(db.queryOne<{
            n: number
        }>("SELECT COUNT(*) n FROM evaluations WHERE session_id = 'final-stream'")?.n, 1);
        assert.equal(db.queryOne<{
            n: number
        }>("SELECT COUNT(*) n FROM evaluation_attempts WHERE session_id = 'final-stream'")?.n, 1);
        const maintenance = enterMaintenance();
        assert.ok(maintenance);
        maintenance();
    } finally {
        gate.resolve();
        providers.openai.streamChat = original;
    }
});

test("evaluation retry retains the lease while provider awaits; DELETE cannot run during maintenance", async () => {
    seed("evaluating", "failed");
    db.exec(`INSERT INTO message_turns (session_id, turn_number, role, content)
    VALUES ('evaluating', 1, 'assistant', 'What trade-off?'),
           ('evaluating', 1, 'user', 'I chose consistency.')`);
    const gate = deferred<void>();
    const original = providers.openai.streamChat;
    providers.openai.streamChat = async () => {
        await gate.promise;
        throw new Error("scripted provider failure");
    };
    try {
        const pending = evaluate.POST(post("sessions/evaluating/evaluate", config), params("evaluating"));
        for (let tries = 0; tries < 50; tries++) {
            const row = db.queryOne<{ status: string }>("SELECT status FROM sessions WHERE id = 'evaluating'");
            if (row?.status === "evaluating") break;
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(enterMaintenance(), null);
        gate.resolve();
        assert.equal((await pending).status, 500);
        const maintenance = enterMaintenance();
        assert.ok(maintenance);
        await busy(await detail.DELETE(new Request(`${ORIGIN}/api/sessions/evaluating`, {
            method: "DELETE", headers: {origin: ORIGIN},
        }), params("evaluating")));
        maintenance();
        assert.equal((await detail.DELETE(new Request(`${ORIGIN}/api/sessions/evaluating`, {
            method: "DELETE", headers: {origin: ORIGIN},
        }), params("evaluating"))).status, 200);
        assert.equal(db.queryOne("SELECT id FROM sessions WHERE id = 'evaluating'"), undefined);
    } finally {
        gate.resolve();
        providers.openai.streamChat = original;
    }
});
