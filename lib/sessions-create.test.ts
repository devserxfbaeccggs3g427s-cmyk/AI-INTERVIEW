import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import Module from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {after, before, beforeEach, test} from "node:test";
import {createHash} from "node:crypto";

const ORIGIN = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const dir = mkdtempSync(join(tmpdir(), "session-create-"));
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
type SessionDetailRoute = typeof import("../app/api/sessions/[id]/route");
type PdfModule = typeof import("./pdf");
type ValidateModule = typeof import("./validate");
type MaintenanceModule = typeof import("./maintenance");

let db: DbModule;
let route: SessionRoute;
let detail: SessionDetailRoute;
let pdf: PdfModule;
let validate: ValidateModule;
let maintenance: MaintenanceModule;

before(async () => {
    [db, route, detail, pdf, validate, maintenance] = await Promise.all([
        import("./db"),
        import("../app/api/sessions/route"),
        import("../app/api/sessions/[id]/route"),
        import("./pdf"),
        import("./validate"),
        import("./maintenance"),
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

/* Each test gets a clean slate; `PRAGMA foreign_keys = ON` (set at open) keeps
 * the cascade hygiene in scope, so we truncate in an order that respects
 * the FK graph (children first, then parents). */
beforeEach(() => {
    db.exec("DELETE FROM evaluation_attempts");
    db.exec("DELETE FROM evaluations");
    db.exec("DELETE FROM cv_extracts");
    db.exec("DELETE FROM message_turns");
    db.exec("DELETE FROM sessions");
    db.exec("DELETE FROM model_configs");
});

/* ---------- helpers ---------- */

function post(url: string, body: unknown, origin: string | null = ORIGIN): Request {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": "test-key",
    };
    if (origin !== null) headers["origin"] = origin;
    return new Request(`${ORIGIN}/api/${url}`, {
        method: "POST", headers, body: JSON.stringify(body),
    });
}

function validConfig() {
    return {provider: "openai", model: "test-model", temperature: 0.5, maxTokens: 2048, topP: 0.9};
}

function validBody(over: Partial<{
    cvSource: "none" | "paste" | "pdf";
    cvText: string;
    cvFilename: string;
    cvDataUrl: string;
    previewDigest: string;
    focus: unknown;
}> = {}) {
    return {
        ...validConfig(),
        role: "Backend Engineer",
        language: "en",
        mode: "strict",
        plannedRounds: 5,
        cvSource: "paste" as const,
        cvText: "a".repeat(50),
        ...over,
    };
}

/** Distinctive PDF data URL whose decoded bytes start with `%PDF-`. Real
 *  pdf-parse would refuse it (no header / no xref), so the test always
 *  installs the `pdfParser.load` stub before sending this body. */
const FAKE_PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQ=";
const FAKE_PDF_TEXT = "PDFFAKE_TEXT_noPdfBytes";
const FAKE_PDF_DIGEST = createHash("sha256").update(FAKE_PDF_TEXT).digest("hex");

function installPdfStub() {
    const original = pdf.pdfParser.load;
    pdf.pdfParser.load = async () => async (_buf: Buffer) => ({text: FAKE_PDF_TEXT});
    return () => {
        pdf.pdfParser.load = original;
    };
}

function tableCount(table: string, where = "1=1", params: unknown[] = []): number {
    return db.query<{n: number}>(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`, params).at(0)?.n ?? 0;
}

async function readJson(res: Response): Promise<any> {
    return res.json();
}

/* ---------- tests ---------- */

test("happy paste: writes sessions + cv_extracts (paste) + model_configs exactly once", async () => {
    const res = await route.POST(post("sessions", validBody()));
    const json = await readJson(res);
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(json.ok, true);
    assert.match(json.sessionId, /^sess_[a-f0-9]{14}$/);
    const id = json.sessionId;

    assert.equal(tableCount("sessions", "id = ?", [id]), 1);
    assert.equal(tableCount("sessions"), 1); // no extras

    const cv = db.queryOne<{source: string; char_count: number; text: string}>(
        "SELECT source, char_count, text FROM cv_extracts WHERE session_id = ?", [id],
    );
    assert.ok(cv);
    assert.equal(cv.source, "paste");
    assert.equal(cv.char_count, 50);
    assert.equal(cv.text, "a".repeat(50));

    const cfg = db.queryOne<{provider: string; temperature: number; model: string}>(
        "SELECT provider, temperature, model FROM model_configs WHERE provider = 'openai'",
    );
    assert.ok(cfg);
    assert.equal(cfg.model, "test-model");
    assert.equal(cfg.temperature, 0.5);
});

test("focus is normalized and snapshotted with the new session", async () => {
    const focus = ["  transactions  ", "Retries & idempotency"];
    const res = await route.POST(post("sessions", validBody({focus})));
    const json = await readJson(res);
    assert.equal(res.status, 200, JSON.stringify(json));
    const session = db.queryOne<{focus_json: string}>("SELECT focus_json FROM sessions WHERE id = ?", [json.sessionId]);
    assert.deepEqual(JSON.parse(session!.focus_json), ["transactions", "Retries & idempotency"]);
    const response = await detail.GET(new Request(`${ORIGIN}/api/sessions/${json.sessionId}`), {params: {id: json.sessionId}});
    assert.deepEqual((await response.json()).session.focus, ["transactions", "Retries & idempotency"]);
    assert.equal(tableCount("cv_extracts"), 1);
});

test("focus limits reject malformed or oversized input without any writes", async () => {
    for (const focus of [["x".repeat(121)], ["one", "two", "three", "four"], ["  "], "not-array"]) {
        const res = await route.POST(post("sessions", validBody({focus})));
        assert.equal(res.status, 400, JSON.stringify(await readJson(res)));
        assert.equal(tableCount("sessions"), 0);
        assert.equal(tableCount("model_configs"), 0);
    }
});

test("happy pdf: stubbed parser yields text; no base64 / signature leak in DB", async () => {
    const restore = installPdfStub();
    try {
        const res = await route.POST(post("sessions", validBody({
            cvSource: "pdf",
            cvText: undefined,
            cvDataUrl: FAKE_PDF_DATA_URL,
            previewDigest: FAKE_PDF_DIGEST,
        } as any)));
        const json = await readJson(res);
        assert.equal(res.status, 200, JSON.stringify(json));
        const id = json.sessionId;

        assert.equal(tableCount("sessions", "id = ?", [id]), 1);
        const cv = db.queryOne<{source: string; char_count: number; text: string; filename: string | null}>(
            "SELECT source, char_count, text, filename FROM cv_extracts WHERE session_id = ?", [id],
        );
        assert.ok(cv);
        assert.equal(cv.source, "pdf");
        assert.equal(cv.text, FAKE_PDF_TEXT);
        assert.equal(cv.char_count, FAKE_PDF_TEXT.length);
        assert.ok(!cv.text.includes("JVBERi"), "extracted text must not contain PDF base64");
    } finally {
        restore();
    }
});

test("paste over MAX_CV_CHARS: 400 with explicit message and zero rows", async () => {
    const overLimit = "a".repeat(validate.MAX_CV_CHARS + 1);
    const res = await route.POST(post("sessions", validBody({cvText: overLimit})));
    const json = await readJson(res);
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.equal(json.error, "cvText exceeds the 20,000 character limit");
    assert.equal(tableCount("sessions"), 0);
    assert.equal(tableCount("cv_extracts"), 0);
    assert.equal(tableCount("model_configs"), 0);
});

test("preview digest mismatch (paste): 409 'Preview stale' and zero rows", async () => {
    const staleDigest = pdf.fingerprintPaste("completely different pasted content");
    const res = await route.POST(post("sessions", validBody({
        cvText: "hi",
        previewDigest: staleDigest,
    })));
    const json = await readJson(res);
    assert.equal(res.status, 409, JSON.stringify(json));
    assert.match(json.error, /Preview stale/);
    assert.equal(tableCount("sessions"), 0);
    assert.equal(tableCount("cv_extracts"), 0);
    assert.equal(tableCount("model_configs"), 0);
});

test("preview digest mismatch (pdf): 409 'Preview stale' and zero rows", async () => {
    const restore = installPdfStub();
    try {
        const res = await route.POST(post("sessions", validBody({
            cvSource: "pdf",
            cvText: undefined,
            cvDataUrl: FAKE_PDF_DATA_URL,
            previewDigest: pdf.fingerprintPaste("OTHER_TEXT"),
        } as any)));
        const json = await readJson(res);
        assert.equal(res.status, 409, JSON.stringify(json));
        assert.match(json.error, /Preview stale/);
        assert.equal(tableCount("sessions"), 0);
        assert.equal(tableCount("cv_extracts"), 0);
        assert.equal(tableCount("model_configs"), 0);
    } finally {
        restore();
    }
});

test("pre-tx error leaves seeded model_configs sentinel untouched", async () => {
    // Seed for `openai` (the provider the failing request will target).
    db.exec(
        `INSERT INTO model_configs (provider, model, base_url, temperature, max_tokens, top_p)
         VALUES ('openai', 'sentinel-old', NULL, 0.111, 1024, 0.5)`,
    );
    // Also seed an unrelated provider to confirm rollback semantics — but since we
    // never enter the transaction (fail before BEGIN), the openai row itself isn't
    // even touched. Asserting both confirms the broader invariant.
    db.exec(
        `INSERT INTO model_configs (provider, model, base_url, temperature, max_tokens, top_p)
         VALUES ('gemini', 'gemini-keep', NULL, 0.222, 2048, 0.7)`,
    );

    const overLimit = "a".repeat(validate.MAX_CV_CHARS + 1);
    const res = await route.POST(post("sessions", validBody({cvText: overLimit})));
    const json = await readJson(res);
    assert.equal(res.status, 400, JSON.stringify(json));

    const openai = db.queryOne<{temperature: number; model: string}>(
        "SELECT temperature, model FROM model_configs WHERE provider = 'openai'",
    );
    assert.ok(openai);
    assert.equal(openai.model, "sentinel-old");
    assert.equal(openai.temperature, 0.111);

    const gemini = db.queryOne<{model: string}>(
        "SELECT model FROM model_configs WHERE provider = 'gemini'",
    );
    assert.ok(gemini);
    assert.equal(gemini.model, "gemini-keep");
    assert.equal(tableCount("sessions"), 0);
    assert.equal(tableCount("cv_extracts"), 0);
});

test("atomicity: runInTransaction rolls back on throw and commits on success", () => {
    const run = db.runInTransaction;
    // Commit path: a successful body persists both writes.
    run("DEFERRED", () => {
        db.exec(
            `INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
             VALUES ('tx-success', 'Backend Engineer', 'en', 'strict', 5, 'openai', 'test-model', 'active')`,
        );
        db.exec(
            `INSERT INTO cv_extracts (session_id, source, filename, text, char_count)
             VALUES ('tx-success', 'paste', NULL, 'committed', 9)`,
        );
    });
    assert.equal(tableCount("sessions", "id = 'tx-success'"), 1);
    assert.equal(tableCount("cv_extracts", "session_id = 'tx-success'"), 1);

    // Rollback path: a throwing body removes every write inside the body.
    assert.throws(
        () => run("DEFERRED", () => {
            db.exec(
                `INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
                 VALUES ('tx-rollback', 'Backend Engineer', 'en', 'strict', 5, 'openai', 'test-model', 'active')`,
            );
            db.exec(
                `INSERT INTO cv_extracts (session_id, source, filename, text, char_count)
                 VALUES ('tx-rollback', 'paste', NULL, 'rolled-back', 12)`,
            );
            throw new Error("synthetic mid-tx failure");
        }),
        /synthetic mid-tx failure/,
    );
    assert.equal(tableCount("sessions", "id = 'tx-rollback'"), 0);
    assert.equal(tableCount("cv_extracts", "session_id = 'tx-rollback'"), 0);

    // The success row above still commits — ROLLBACK on one transaction does
    // not poison the connection, so a subsequent body still works.
    run("IMMEDIATE", () => {
        db.exec(
            `INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, status)
             VALUES ('tx-after-rollback', 'Backend Engineer', 'en', 'strict', 5, 'openai', 'test-model', 'active')`,
        );
    });
    assert.equal(tableCount("sessions", "id = 'tx-after-rollback'"), 1);
});

test("strict zod: extra fields are rejected and no rows are written", async () => {
    const res = await route.POST(post("sessions", {...validBody(), evilField: "x"}));
    const json = await readJson(res);
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.match(json.error, /Unrecognized key|evilField/i);
    assert.equal(tableCount("sessions"), 0);
    assert.equal(tableCount("cv_extracts"), 0);
    assert.equal(tableCount("model_configs"), 0);
});

test("origin guard: bad origin → 403 without reading the body, no rows written", async () => {
    let bodyRead = false;
    const req = new Request(`${ORIGIN}/api/sessions`, {
        method: "POST",
        headers: {origin: "https://evil.example", "content-type": "application/json"},
        body: JSON.stringify(validBody()),
    });
    Object.defineProperty(req, "json", {
        configurable: true,
        value: () => {
            bodyRead = true;
            return Promise.resolve(validBody());
        },
    });
    const res = await route.POST(req);
    assert.equal(res.status, 403);
    assert.equal(bodyRead, false, "request body must not be read after origin rejection");
    assert.equal(tableCount("sessions"), 0);
    assert.equal(tableCount("cv_extracts"), 0);
});

test("maintenance in progress → 409 without touching SQLite; operations lease preserved", async () => {
    let bodyRead = false;
    const releaseMaint = maintenance.enterMaintenance();
    assert.ok(releaseMaint);
    try {
        const req = new Request(`${ORIGIN}/api/sessions`, {
            method: "POST",
            headers: {origin: ORIGIN, "content-type": "application/json"},
            body: JSON.stringify(validBody()),
        });
        Object.defineProperty(req, "json", {
            configurable: true,
            value: () => {
                bodyRead = true;
                return Promise.resolve(validBody());
            },
        });
        const res = await route.POST(req);
        assert.equal(res.status, 409);
        assert.equal(bodyRead, false, "body must not be read once maintenance is active");
        assert.equal(tableCount("sessions"), 0);
        assert.equal(tableCount("cv_extracts"), 0);
    } finally {
        releaseMaint();
    }
});

test("no PDF bytes leak into DB or session row when cvSource='pdf'", async () => {
    const restore = installPdfStub();
    try {
        // LEAKED-PDF-marker in the data URL — a faithful extractor would have no
        // reason to keep this substring past sanitisation.
        const poisoned = "data:application/pdf;base64,JVBERi0xLjQKLEVMQUtFRC1QREYtTUFSS0VSLVhZWi1MT0x8fA==";
        // That decoded %PDF-...LEAKED-PDF-marker-XYZ-LOL
        const digest = FAKE_PDF_DIGEST; // stub always returns FAKE_PDF_TEXT
        const res = await route.POST(post("sessions", validBody({
            cvSource: "pdf",
            cvText: undefined,
            cvDataUrl: poisoned,
            previewDigest: digest,
        } as any)));
        const json = await readJson(res);
        assert.equal(res.status, 200, JSON.stringify(json));
        const id = json.sessionId;

        const cv = db.queryOne<{text: string}>("SELECT text FROM cv_extracts WHERE session_id = ?", [id]);
        assert.ok(cv);
        // Stored text is exactly the stub's output; no leak markers, no PDF base64.
        assert.equal(cv.text, FAKE_PDF_TEXT);
        assert.ok(!cv.text.includes("LEAKED"), "extracted text must not contain payload substrings");
        assert.ok(!cv.text.includes("JVBERi"), "extracted text must not contain base64 PDF signature");
        assert.ok(!cv.text.includes("base64"), "extracted text must not contain the prefix text");

        // Dump every other table for that session and check nothing leaks.
        const sess = db.queryOne<Record<string, unknown>>(`SELECT * FROM sessions WHERE id = ?`, [id]);
        assert.ok(sess);
        for (const value of Object.values(sess)) {
            if (typeof value === "string") {
                assert.ok(!value.includes("LEAKED"), "sessions row must not contain PDF payload leak");
                assert.ok(!value.includes("JVBERi"), "sessions row must not contain PDF base64 sig");
            }
        }
        const cfg = db.queryOne<Record<string, unknown>>(`SELECT * FROM model_configs WHERE provider = 'openai'`);
        assert.ok(cfg);
        for (const value of Object.values(cfg)) {
            if (typeof value === "string") {
                assert.ok(!value.includes("LEAKED"));
                assert.ok(!value.includes("JVBERi"));
            }
        }
    } finally {
        restore();
    }
});
