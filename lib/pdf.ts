/**
 * PDF validation and text extraction (FR-2 Text Extraction fallback path).
 *
 * Strategy:
 *   - Validate the data URL strictly: exact `data:application/pdf;base64,` prefix,
 *     base64 alphabet, decoded byte ceiling, and the literal `%PDF-` signature.
 *   - Use pdf-parse on the server to extract text.
 *   - Sanitise: collapse whitespace, strip control chars, drop empty lines.
 *   - Clamp to MAX_CV_CHARS (20,000) and report the prompt slice (6,000).
 *
 * Every rejection is a `PdfError` carrying the HTTP status the caller should answer
 * with, so routes never match on messages. Messages never contain payload bytes.
 */
import "server-only";

import { createHash } from "node:crypto";
import { MAX_CV_CHARS, MAX_PDF_BYTES, MAX_PROMPT_CV_CHARS } from "./validate";

export { MAX_PDF_BYTES } from "./validate";

/** Nothing else may sit between `data:` and the payload; the media type is matched case-insensitively. */
const PDF_DATA_URL_PREFIX = "data:application/pdf;base64,";
const PDF_SIGNATURE = "%PDF-";
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/;
/** Longest base64 run that can still decode within MAX_PDF_BYTES; lets us refuse before allocating. */
const MAX_PDF_BASE64_CHARS = 4 * Math.ceil(MAX_PDF_BYTES / 3);

/** Longest data URL this module accepts; request schemas use it as their ceiling. */
export const MAX_PDF_DATA_URL_CHARS = PDF_DATA_URL_PREFIX.length + MAX_PDF_BASE64_CHARS;

/** Rejection carrying the HTTP status the route should answer with. */
export class PdfError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface PdfExtractResult {
  text: string;
  charCount: number;
  truncated: boolean;
}

/** What /new shows before the CV is sent to a provider. */
export interface PdfPreview {
  /** Sanitised and clamped to MAX_CV_CHARS — the text that will be stored. */
  text: string;
  /** === text.length */
  charCount: number;
  /** True when the parsed PDF produced more than MAX_CV_CHARS characters. */
  truncated: boolean;
  /** Length of the slice handed to the prompt (MAX_PROMPT_CV_CHARS). */
  promptCharCount: number;
  /** True when text is longer than the prompt slice. */
  promptTruncated: boolean;
  /** sha256(text), hex — lets create compare this text against a re-parse. */
  digest: string;
}

type PdfParseFn = (b: Buffer) => Promise<{ text: string }>;

/** pdf-parse triggers a self-test when run as the entry script; safe inside Next.js. */
async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = (await import("pdf-parse")) as { default?: PdfParseFn } & Partial<PdfParseFn>;
  if (typeof mod === "function") return mod as unknown as PdfParseFn;
  if (typeof mod.default === "function") return mod.default;
  throw new Error("pdf-parse: unexpected module shape");
}

/** Parser indirection: production always resolves pdf-parse; tests swap in a stub. */
export const pdfParser: { load: () => Promise<PdfParseFn> } = { load: loadPdfParse };

/** Decode and screen a PDF data URL without invoking the parser. Throws PdfError. */
export function validatePdfDataUrl(dataUrl: string): Buffer {
  const prefix = typeof dataUrl === "string" ? dataUrl.slice(0, PDF_DATA_URL_PREFIX.length) : "";
  if (prefix.toLowerCase() !== PDF_DATA_URL_PREFIX) {
    throw new PdfError("Expected a data:application/pdf;base64 URL", 400);
  }
  const payload = dataUrl.slice(PDF_DATA_URL_PREFIX.length);
  if (payload.length > MAX_PDF_BASE64_CHARS) throw new PdfError("PDF exceeds the 10 MiB limit", 413);
  if (payload.length === 0) throw new PdfError("Empty PDF payload", 400);
  // Buffer.from() silently drops invalid characters, so screen the alphabet first.
  if (payload.length % 4 !== 0 || !BASE64_PAYLOAD.test(payload)) {
    throw new PdfError("Malformed base64 PDF payload", 400);
  }
  const bytes = Buffer.from(payload, "base64");
  assertPdfBytes(bytes);
  return bytes;
}

/** Size then signature: both are cheap and neither reads the payload into a message. */
function assertPdfBytes(bytes: Buffer): void {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PdfError("PDF exceeds the 10 MiB limit", 413);
  // Exactly at offset 0: a byte-order mark or leading whitespace is not a PDF header.
  const header = bytes.subarray(0, PDF_SIGNATURE.length).toString("latin1");
  if (bytes.length < PDF_SIGNATURE.length || header !== PDF_SIGNATURE) {
    throw new PdfError("Not a PDF: missing %PDF- signature", 400);
  }
}

export async function extractPdfText(bytes: ArrayBuffer | Buffer): Promise<PdfExtractResult> {
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  assertPdfBytes(buf);
  // A parser that fails to load is a server fault, not a bad upload: let it propagate so
  // the route answers 500 instead of blaming the client with a PdfError.
  const parse = await pdfParser.load();
  let raw: string;
  try {
    ({ text: raw } = await parse(buf));
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw new PdfError("PDF could not be parsed", 400);
  }
  return clampText(raw);
}

export async function extractPdfFromDataUrl(dataUrl: string): Promise<PdfExtractResult> {
  return extractPdfText(validatePdfDataUrl(dataUrl));
}

/** Same input as extractPdfFromDataUrl, but shaped for the /new preview screen. */
export async function extractPdfPreview(dataUrl: string): Promise<PdfPreview> {
  const extracted = await extractPdfFromDataUrl(dataUrl);
  return {
    text: extracted.text,
    charCount: extracted.charCount,
    truncated: extracted.truncated,
    promptCharCount: Math.min(extracted.charCount, MAX_PROMPT_CV_CHARS),
    promptTruncated: extracted.charCount > MAX_PROMPT_CV_CHARS,
    digest: fingerprintPaste(extracted.text),
  };
}

/** sha256 of the stored CV text, hex. Paste and PDF share it so one digest compares both. */
export function fingerprintPaste(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function clampText(raw: string): PdfExtractResult {
  const cleaned = sanitise(raw);
  const truncated = cleaned.length > MAX_CV_CHARS;
  const out = truncated ? cleaned.slice(0, MAX_CV_CHARS) : cleaned;
  return { text: out, charCount: out.length, truncated };
}

function sanitise(input: string): string {
  // Strip ASCII control chars except \n and \t.
  // The character class below uses explicit escape sequences (no invisible
  // range characters) so it is safe to copy into a UTF-8 source file.
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}