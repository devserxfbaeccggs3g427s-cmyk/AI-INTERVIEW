/**
 * PDF text extraction (FR-2 Text Extraction fallback path).
 *
 * Strategy:
 *   - Use pdf-parse on the server to extract text.
 *   - Pass user-uploaded bytes straight to the library inside a server-only module.
 *   - Sanitise: collapse whitespace, strip control chars, normalise quotes.
 *   - Clamp to MAX_CV_CHARS (20,000 — see lib/validate.ts).
 */
import "server-only";

const MAX_LEN = 20_000;

export interface PdfExtractResult {
  text: string;
  charCount: number;
  truncated: boolean;
}

type PdfParseFn = (b: Buffer) => Promise<{ text: string }>;

/** pdf-parse triggers a self-test when run as the entry script; safe inside Next.js. */
async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = (await import("pdf-parse")) as { default?: PdfParseFn } & Partial<PdfParseFn>;
  if (typeof mod === "function") return mod as unknown as PdfParseFn;
  if (typeof mod.default === "function") return mod.default;
  throw new Error("pdf-parse: unexpected module shape");
}

export async function extractPdfText(bytes: ArrayBuffer | Buffer): Promise<PdfExtractResult> {
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const parse = await loadPdfParse();
  const { text } = await parse(buf);
  const cleaned = sanitise(text);
  const truncated = cleaned.length > MAX_LEN;
  const out = truncated ? cleaned.slice(0, MAX_LEN) : cleaned;
  return { text: out, charCount: out.length, truncated };
}

export async function extractPdfFromDataUrl(dataUrl: string): Promise<PdfExtractResult> {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) {
    throw new Error("Malformed data URL");
  }
  const meta = dataUrl.slice(5, comma);
  if (!/;base64/i.test(meta)) throw new Error("Only base64 PDF data URLs accepted");
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return extractPdfText(buf);
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
