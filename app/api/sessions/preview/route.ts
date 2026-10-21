import { z } from "zod";
import { env } from "@/lib/env";
import { enterOperation } from "@/lib/maintenance";
import { extractPdfPreview, MAX_PDF_DATA_URL_CHARS, PdfError } from "@/lib/pdf";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON envelope slack on top of the longest data URL we accept. */
const MAX_BODY_CHARS = MAX_PDF_DATA_URL_CHARS + 4_096;
// Deliberately double the ceiling: an oversized PDF must reach the PDF validator to be
// answered with 413, not swallowed here as a 400.
const Body = z.object({ cvDataUrl: z.string().min(1).max(MAX_PDF_DATA_URL_CHARS * 2) }).strict();

/** POST — extract a CV PDF and report exactly what would be stored and sent (FR-2).
 *  Holds an operation lease so a concurrent commit-restore cannot replace the database
 *  file underneath us; nothing here is persisted and the PDF bytes are never logged. */
export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;

  const contentType = req.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return privateJson({ ok: false, error: "Expected application/json" }, { status: 415 });
  }
  const length = req.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_BODY_CHARS) {
    return privateJson({ ok: false, error: "PDF exceeds the 10 MiB limit" }, { status: 413 });
  }

  const release = enterOperation();
  if (!release) return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return privateJson({ ok: false, error: "Expected { cvDataUrl } with a PDF data URL" }, { status: 400 });
    }
    return privateJson(await extractPdfPreview(parsed.data.cvDataUrl));
  } catch (error) {
    if (error instanceof PdfError) {
      return privateJson({ ok: false, error: error.message }, { status: error.status });
    }
    // Anything else is a server fault (for example a parser that will not load).
    return privateJson({ ok: false, error: "PDF preview failed" }, { status: 500 });
  } finally {
    release();
  }
}