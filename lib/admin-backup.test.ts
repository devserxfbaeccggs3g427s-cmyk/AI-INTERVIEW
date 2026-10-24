import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ORIGIN = "https://interview.example.com";
const PII = "PRIVATE_CV_DO_NOT_LOG_9df6";

function post(path: string, body: string | Uint8Array, extra: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...extra }, body,
  });
}

function privateResponse(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("admin backup and two-phase restore use bounded, private, single-use JSON, never SQL", async () => {
  const directory = mkdtempSync(join(tmpdir(), "admin-backup-test-"));
  const oldDb = process.env.INTERVIEW_DB_PATH;
  const oldOrigin = process.env.PUBLIC_ORIGIN;
  type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
  const loader = Module as unknown as { _load: Loader };
  const originalLoad = loader._load;
  process.env.INTERVIEW_DB_PATH = join(directory, "isolated.db");
  process.env.PUBLIC_ORIGIN = ORIGIN;
  loader._load = function (id: string, ...args: [unknown, boolean?]) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
  };
  try {
    const [admin, validate, commit, db, backup, maintenance] = await Promise.all([
      import("../app/api/admin/db/route"),
      import("../app/api/admin/db/validate-restore/route"),
      import("../app/api/admin/db/commit-restore/route"),
      import("./db"), import("./backup"), import("./maintenance"),
    ]);
    const insert = () => db.exec(`INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model)
      VALUES ('test-session', ?, 'en', 'strict', 5, 'openai', 'model')`, [PII]);
    insert();

    for (const handler of [admin.POST, validate.POST, commit.POST]) {
      const req = post("/api/admin/db", "not even JSON", { origin: "https://evil.example" });
      const denied = await handler(req);
      assert.equal(denied.status, 403);
      assert.equal(req.bodyUsed, false, "guard must run before body read");
      privateResponse(denied);
    }

    for (const body of [JSON.stringify({ action: "import", payload: "DELETE FROM sessions;" }),
      JSON.stringify({ action: "backup", payload: PII })]) {
      const response = await admin.POST(post("/api/admin/db", body));
      assert.equal(response.status, 400);
      privateResponse(response);
      assert.ok(!(await response.text()).includes(PII));
    }
    const oversizedAction = await admin.POST(post("/api/admin/db", " ".repeat(1025)));
    assert.equal(oversizedAction.status, 413);
    privateResponse(oversizedAction);

    const exportResponse = await admin.POST(post("/api/admin/db", '{"action":"backup"}'));
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type")!, /application\/json/);
    assert.match(exportResponse.headers.get("content-disposition")!, /\.json"$/);
    privateResponse(exportResponse);
    const bytes = new Uint8Array(await exportResponse.arrayBuffer());
    assert.equal(backup.parseBackup(bytes).counts.sessions, 1);

    db.getDb().exec("PRAGMA user_version = 5");
    try {
      const failedExport = await admin.POST(post("/api/admin/db", '{"action":"backup"}'));
      assert.equal(failedExport.status, 409);
      privateResponse(failedExport);
      assert.match(failedExport.headers.get("content-type")!, /application\/json/);
      assert.equal(failedExport.headers.get("content-disposition"), null);
      assert.equal((await failedExport.text()).includes(PII), false);
    } finally { db.getDb().exec("PRAGMA user_version = 4"); }

    const tooLarge = post("/api/admin/db/validate-restore", bytes, { "content-length": String(backup.BACKUP_MAX_BYTES + 1) });
    const rejected = await validate.POST(tooLarge);
    assert.equal(rejected.status, 413);
    assert.equal(tooLarge.bodyUsed, false);
    privateResponse(rejected);

    let emitted = 0;
    const streamed = new Request(`${ORIGIN}/api/admin/db/validate-restore`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
      duplex: "half", body: new ReadableStream<Uint8Array>({
        pull(controller) {
          emitted += 1;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
      }),
    } as RequestInit & { duplex: "half" });
    const streamedRejection = await validate.POST(streamed);
    assert.equal(streamedRejection.status, 413);
    assert.ok(emitted <= 52, "stop after reaching the size limit");
    privateResponse(streamedRejection);

    const invalid = await validate.POST(post("/api/admin/db/validate-restore", "{\"role\":\"" + PII + "\"}"));
    assert.equal(invalid.status, 422);
    assert.ok(!(await invalid.text()).includes(PII));

    const preview = await validate.POST(post("/api/admin/db/validate-restore", bytes));
    assert.equal(preview.status, 200);
    privateResponse(preview);
    const validated = await preview.json();
    assert.equal(validated.incomingCounts.sessions, 1);
    assert.equal(validated.currentCounts.sessions, 1);
    assert.equal(typeof validated.token, "string");
    assert.ok(validated.expiresAt > Date.now());
    assert.ok(!JSON.stringify(validated).includes(PII));

    const malformedToken = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": "not-a-token" }));
    assert.equal(malformedToken.status, 409);
    assert.equal((await malformedToken.text()).includes(PII), false);

    const modified = Uint8Array.from(bytes);
    modified[modified.length - 1] ^= 1;
    const wrongBytes = await commit.POST(post("/api/admin/db/commit-restore", modified, { "x-restore-token": validated.token }));
    assert.equal(wrongBytes.status, 409);
    assert.equal((await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": validated.token }))).status, 409);

    const expiresPreview = await (await validate.POST(post("/api/admin/db/validate-restore", bytes))).json();
    const originalNow = Date.now;
    Date.now = () => expiresPreview.expiresAt + 1;
    try {
      const expired = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": expiresPreview.token }));
      assert.equal(expired.status, 409);
      assert.equal(backup.getBackupCounts().sessions, 1);
    } finally { Date.now = originalNow; }
    assert.equal((await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": expiresPreview.token }))).status, 409);

    const beforeChange = await (await validate.POST(post("/api/admin/db/validate-restore", bytes))).json();
    assert.equal((await admin.POST(post("/api/admin/db", '{"action":"wipe-sessions"}'))).status, 200);
    const stale = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": beforeChange.token }));
    assert.equal(stale.status, 409);
    assert.equal(backup.getBackupCounts().sessions, 0);

    // A same-count UPDATE after preview must not be silently overwritten:
    // row counts alone cannot see it, the content fingerprint can.
    insert();
    const sameCountBytes = new Uint8Array(await (await admin.POST(post("/api/admin/db", '{"action":"backup"}'))).arrayBuffer());
    const beforeEdit = await (await validate.POST(post("/api/admin/db/validate-restore", sameCountBytes))).json();
    db.exec("UPDATE sessions SET role = 'EDITED_AFTER_PREVIEW' WHERE id = 'test-session'");
    assert.deepEqual(backup.getBackupCounts(), beforeEdit.currentCounts, "counts must be unchanged by the edit");
    const staleEdit = await commit.POST(post("/api/admin/db/commit-restore", sameCountBytes, { "x-restore-token": beforeEdit.token }));
    assert.equal(staleEdit.status, 409);
    assert.equal(db.queryOne<{ role: string }>("SELECT role FROM sessions WHERE id = 'test-session'")?.role, "EDITED_AFTER_PREVIEW");
    db.exec("DELETE FROM sessions");

    const beforeBusy = await (await validate.POST(post("/api/admin/db/validate-restore", bytes))).json();
    const releaseOperation = maintenance.enterOperation();
    assert.ok(releaseOperation);
    try {
      const busy = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": beforeBusy.token }));
      assert.equal(busy.status, 409);
      assert.equal(backup.getBackupCounts().sessions, 0);
    } finally { releaseOperation(); }

    const finalPreview = await (await validate.POST(post("/api/admin/db/validate-restore", bytes))).json();
    const restored = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": finalPreview.token }));
    assert.equal(restored.status, 200);
    privateResponse(restored);
    assert.equal((await restored.json()).counters.sessions, 1);
    assert.equal(db.queryOne<{ role: string }>("SELECT role FROM sessions WHERE id = 'test-session'")?.role, PII);
    const replay = await commit.POST(post("/api/admin/db/commit-restore", bytes, { "x-restore-token": finalPreview.token }));
    assert.equal(replay.status, 409);
    assert.ok(!(await replay.text()).includes(PII));

    assert.equal((await admin.POST(post("/api/admin/db", '{"action":"vacuum"}'))).status, 200);
    assert.equal((await admin.POST(post("/api/admin/db", '{"action":"wipe-all"}'))).status, 200);
    assert.equal(backup.getBackupCounts().sessions, 0);
  } finally {
    loader._load = originalLoad;
    if (oldDb === undefined) delete process.env.INTERVIEW_DB_PATH;
    else process.env.INTERVIEW_DB_PATH = oldDb;
    if (oldOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = oldOrigin;
    rmSync(directory, { recursive: true, force: true });
  }
});
