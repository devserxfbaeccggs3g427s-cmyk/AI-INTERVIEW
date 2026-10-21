import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { PdfError } from "./pdf";

const ORIGIN = "https://interview.example.com";
const previousDb = process.env.INTERVIEW_DB_PATH;
const previousOrigin = process.env.PUBLIC_ORIGIN;
const dir = mkdtempSync(join(tmpdir(), "pdf-preview-"));
// Set before any import so nothing can reach the real interview_sessions.db.
process.env.INTERVIEW_DB_PATH = join(dir, "isolated.db");
process.env.PUBLIC_ORIGIN = ORIGIN;

// `server-only` is a build-time marker with no runtime export; make it importable here.
type Loader = (id: string, parent: unknown, isMain?: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id: string, ...args: [unknown, boolean?]) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};

type Pdf = typeof import("./pdf");
type PreviewRoute = typeof import("../app/api/sessions/preview/route");
let pdf: Pdf;
let route: PreviewRoute;

before(async () => {
  [pdf, route] = await Promise.all([import("./pdf"), import("../app/api/sessions/preview/route")]);
});

after(() => {
  loader._load = originalLoad;
  if (previousDb === undefined) delete process.env.INTERVIEW_DB_PATH;
  else process.env.INTERVIEW_DB_PATH = previousDb;
  if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previousOrigin;
  rmSync(dir, { recursive: true, force: true });
});

const PREFIX = "data:application/pdf;base64,";
const HEADER = Buffer.from("%PDF-1.4\n", "ascii");

function bytes(...parts: Buffer[]): Buffer {
  return Buffer.concat([HEADER, ...parts]);
}

function url(payload: Buffer): string {
  return PREFIX + payload.toString("base64");
}

/** Swaps in a parser stub so assertions never depend on a real PDF's formatting. */
async function withStubText<T>(text: string, run: () => Promise<T>): Promise<T> {
  const original = pdf.pdfParser.load;
  pdf.pdfParser.load = async () => async () => ({ text });
  try {
    return await run();
  } finally {
    pdf.pdfParser.load = original;
  }
}

function pdfErrorFrom(run: () => unknown): PdfError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof pdf.PdfError, `expected PdfError, received ${String(error)}`);
    return error;
  }
  throw new Error("expected a PdfError to be thrown");
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/sessions/preview`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("validatePdfDataUrl accepts a well-formed PDF data URL and returns the decoded bytes", () => {
  const payload = bytes(Buffer.from("1 0 obj\nendobj\n%%EOF\n", "ascii"));
  assert.deepEqual(pdf.validatePdfDataUrl(url(payload)), payload);
  // The media type and the base64 marker are matched case-insensitively.
  assert.ok(pdf.validatePdfDataUrl(`DATA:APPLICATION/PDF;BASE64,${payload.toString("base64")}`));
});

test("decoded PDF bytes above 10 MiB are refused with 413, at the limit they pass", () => {
  const atLimit = bytes(Buffer.alloc(pdf.MAX_PDF_BYTES - HEADER.length, 0x41));
  assert.equal(atLimit.byteLength, pdf.MAX_PDF_BYTES);
  assert.equal(pdf.validatePdfDataUrl(url(atLimit)).byteLength, pdf.MAX_PDF_BYTES);

  const overLimit = bytes(Buffer.alloc(pdf.MAX_PDF_BYTES - HEADER.length + 1, 0x41));
  const error = pdfErrorFrom(() => pdf.validatePdfDataUrl(url(overLimit)));
  assert.equal(error.status, 413);
  assert.match(error.message, /10 MiB/);

  // A payload whose base64 run alone is over the ceiling is refused before decoding.
  assert.equal(pdfErrorFrom(() => pdf.validatePdfDataUrl(`${PREFIX}${"A".repeat(pdf.MAX_PDF_BYTES * 2)}`)).status, 413);
});

test("non-PDF media types, missing ;base64 and malformed data URLs are refused with 400", () => {
  const b64 = bytes().toString("base64");
  for (const candidate of [
    `data:text/plain;base64,${b64}`,
    `data:application/octet-stream;base64,${b64}`,
    `data:;base64,${b64}`,
    `data:application/pdf,${b64}`,
    "data:application/pdf;base64",
    "application/pdf;base64," + b64,
    b64,
    "",
    "data:application/pdf;base64x," + b64,
    `data:application/pdf;charset=utf-8;base64,${b64}`,
  ]) {
    const error = pdfErrorFrom(() => pdf.validatePdfDataUrl(candidate));
    assert.equal(error.status, 400, `must refuse ${candidate.slice(0, 48)}`);
    assert.equal(error.message, "Expected a data:application/pdf;base64 URL");
  }
});

test("empty and invalid base64 payloads are refused with 400", () => {
  for (const payload of ["", "abc", `${btoa("x")}!`, `${btoa("x")}=`, `${btoa("x")}==`, "AAAA ", "AA=A"]) {
    const error = pdfErrorFrom(() => pdf.validatePdfDataUrl(PREFIX + payload));
    assert.equal(error.status, 400, `must refuse ${JSON.stringify(payload)}`);
  }
});

test("a payload that does not start with %PDF- is refused with 400", () => {
  for (const body of ["NOTAPDF\n", "﻿%PDF-1.4\n", " %PDF-1.4\n", "%pdF-1.4\n"]) {
    const error = pdfErrorFrom(() => pdf.validatePdfDataUrl(url(Buffer.from(body, "utf8"))));
    assert.equal(error.status, 400, `must refuse ${JSON.stringify(body.slice(0, 8))}`);
    assert.match(error.message, /signature/);
  }
});

test("fingerprintPaste is deterministic, content-sensitive and 64 hex characters", () => {
  const digest = pdf.fingerprintPaste("Backend engineer\n5 years");
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(pdf.fingerprintPaste("Backend engineer\n5 years"), digest);
  assert.notEqual(pdf.fingerprintPaste("Backend engineer\n6 years"), digest);
  assert.notEqual(pdf.fingerprintPaste(""), digest);
  // Paste and PDF share the fingerprint so one digest compares either source.
  assert.equal(pdf.fingerprintPaste("ünïcode CV"), pdf.fingerprintPaste("ünïcode CV"));
});

test("extractPdfPreview reports the stored text, the prompt slice and a digest", async () => {
  const preview = await withStubText("  Senior   Backend\tEngineer\n\n\nRole: API platform  \n", () =>
    pdf.extractPdfPreview(url(bytes())),
  );
  assert.equal(preview.text, "Senior Backend Engineer\nRole: API platform");
  assert.equal(preview.charCount, preview.text.length);
  assert.equal(preview.truncated, false);
  assert.equal(preview.promptCharCount, preview.text.length);
  assert.equal(preview.promptTruncated, false);
  assert.equal(preview.digest, pdf.fingerprintPaste(preview.text));
});

test("extractPdfPreview clamps at 20,000 stored chars and reports the 6,000-char prompt slice", async () => {
  const preview = await withStubText("x".repeat(25_000), () => pdf.extractPdfPreview(url(bytes())));
  assert.equal(preview.charCount, 20_000);
  assert.equal(preview.text.length, 20_000);
  assert.equal(preview.truncated, true);
  assert.equal(preview.promptCharCount, 6_000);
  assert.equal(preview.promptTruncated, true);
  assert.equal(preview.digest, pdf.fingerprintPaste(preview.text));
});

test("extractPdfPreview maps parser failures to PdfError 400 and never echoes the payload", async () => {
  const original = pdf.pdfParser.load;
  pdf.pdfParser.load = async () => async () => {
    throw new Error("boom: %PDF-1.4 confidential contents");
  };
  try {
    const error = await pdf.extractPdfPreview(url(bytes())).then(
      () => null,
      (reason: unknown) => reason,
    );
    assert.ok(error instanceof pdf.PdfError, `expected PdfError, received ${String(error)}`);
    assert.equal(error.status, 400);
    assert.equal(error.message, "PDF could not be parsed");
  } finally {
    pdf.pdfParser.load = original;
  }
});

test("a parser that cannot load surfaces as a server fault, not as a PdfError", async () => {
  const original = pdf.pdfParser.load;
  pdf.pdfParser.load = async () => {
    throw new Error("ENOENT: pdf-parse test fixture");
  };
  try {
    await assert.rejects(
      () => pdf.extractPdfPreview(url(bytes())),
      (error: unknown) => !(error instanceof pdf.PdfError),
    );
  } finally {
    pdf.pdfParser.load = original;
  }
});

test("the real pdf-parse parser extracts the bundled sample PDF", async (t) => {
  const root = join(process.cwd(), "node_modules/pdf-parse");
  const sample = join(root, "test/data/01-valid.pdf");
  // pdf-parse's entry module self-tests when `module.parent` is null (true under ESM),
  // so require the implementation module the entry re-exports.
  const impl = join(root, "lib/pdf-parse.js");
  if (!existsSync(sample) || !existsSync(impl)) return t.skip("pdf-parse sources not installed");
  const realParse = createRequire(import.meta.url)(impl) as (b: Buffer) => Promise<{ text: string }>;
  const payload = readFileSync(sample);
  assert.equal(payload.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.deepEqual(pdf.validatePdfDataUrl(url(payload)), payload);
  const original = pdf.pdfParser.load;
  pdf.pdfParser.load = async () => realParse;
  try {
    const preview = await pdf.extractPdfPreview(url(payload));
    assert.ok(preview.charCount > 0, "sample PDF must yield text");
    assert.equal(preview.charCount, preview.text.length);
    assert.ok(preview.charCount <= 20_000);
    assert.equal(preview.promptCharCount, Math.min(preview.charCount, 6_000));
    assert.equal(preview.promptTruncated, preview.charCount > 6_000);
    assert.equal(preview.digest, pdf.fingerprintPaste(preview.text));
  } finally {
    pdf.pdfParser.load = original;
  }
});

test("the preview route refuses a foreign or missing Origin before reading the body", async () => {
  const headerSets: Record<string, string>[] = [{ origin: "https://evil.example" }, {}];
  for (const headers of headerSets) {
    const request = new Request(`${ORIGIN}/api/sessions/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ cvDataUrl: url(bytes()) }),
    });
    Object.defineProperty(request, "json", {
      value: () => {
        throw new Error("body read");
      },
    });
    const response = await route.POST(request);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(request.bodyUsed, false);
  }
});

test("the preview route requires a JSON content type", async () => {
  for (const contentType of [undefined, "multipart/form-data; boundary=x", "text/plain"]) {
    const headers: Record<string, string> = { origin: ORIGIN };
    if (contentType) headers["content-type"] = contentType;
    const request = new Request(`${ORIGIN}/api/sessions/preview`, {
      method: "POST", headers, body: JSON.stringify({ cvDataUrl: url(bytes()) }),
    });
    assert.equal((await route.POST(request)).status, 415);
  }
  // charset is the only parameter the JSON media type may carry.
  assert.equal((await route.POST(post({}, { "content-type": "application/json; charset=utf-8" }))).status, 400);
});

test("the preview route maps validation failures onto their status codes", async () => {
  const b64 = bytes().toString("base64");
  const cases: [unknown, number][] = [
    [{ cvDataUrl: url(Buffer.from("NOTAPDF", "ascii")) }, 400],
    [{ cvDataUrl: "data:text/plain;base64," + b64 }, 400],
    [{ cvDataUrl: PREFIX + `${btoa("x")}!` }, 400],
    [{ cvDataUrl: url(bytes(Buffer.alloc(pdf.MAX_PDF_BYTES, 0x41))) }, 413],
    [{ cvDataUrl: url(bytes()), extra: "nope" }, 400],
    [{}, 400],
    [null, 400],
    ["not json at all", 400],
  ];
  for (const [body, status] of cases) {
    const response = await route.POST(post(body));
    assert.equal(response.status, status, `body ${JSON.stringify(body).slice(0, 48)}`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = (await response.json()) as { ok: boolean; error: string };
    assert.equal(payload.ok, false);
    assert.ok(payload.error.length > 0);
    // Rejections describe the rule, never the uploaded bytes.
    assert.ok(!payload.error.includes("NOTAPDF"), payload.error);
  }
});

test("the preview route answers 200 with the PdfPreview body and never persists", async () => {
  const text = "Staff Engineer\nBuilt the payments platform";
  const response = await withStubText(text, () => route.POST(post({ cvDataUrl: url(bytes()) })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await response.json(), {
    text,
    charCount: text.length,
    truncated: false,
    promptCharCount: text.length,
    promptTruncated: false,
    digest: pdf.fingerprintPaste(text),
  });
  // Nothing here may reach disk; the temp DB is only ever created by lib/db.ts.
  assert.ok(!existsSync(join(dir, "isolated.db")));
});

test("the preview route answers 409 while maintenance holds the database", async () => {
  const { enterMaintenance } = await import("./maintenance");
  const release = enterMaintenance();
  assert.ok(release);
  try {
    assert.equal((await route.POST(post({ cvDataUrl: url(bytes()) }))).status, 409);
  } finally {
    release();
  }
  assert.equal((await withStubText("after maintenance", () => route.POST(post({ cvDataUrl: url(bytes()) })))).status, 200);
});