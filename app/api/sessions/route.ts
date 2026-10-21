import { randomUUID } from "node:crypto";
import { z } from "zod";
import { exec, query, runInTransaction } from "@/lib/db";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import type { SessionRow } from "@/lib/types";
import { MAX_CV_CHARS, validateStartSessionInput } from "@/lib/validate";
import { extractPdfPreview, fingerprintPaste, MAX_PDF_DATA_URL_CHARS, PdfError } from "@/lib/pdf";
// Type-only: erased at compile time, so this never drags lib/pdf's "server-only" import
// anywhere it does not belong.
import type { PdfPreview } from "@/lib/pdf";
import { env } from "@/lib/env";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { enterOperation } from "@/lib/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — paginated history list (FR-18) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const provider = u.searchParams.get("provider") || "all";
  const status = u.searchParams.get("status") || "all";
  const mode = u.searchParams.get("mode") || "all";
  const q = (u.searchParams.get("q") || "").trim();
  const sort = u.searchParams.get("sort") || "newest";
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") || 50)));

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (provider !== "all") { clauses.push("s.provider = ?"); params.push(provider); }
  if (status !== "all")    { clauses.push("s.status = ?");   params.push(status); }
  if (mode !== "all")      { clauses.push("s.mode = ?");     params.push(mode); }
  if (q)                   { clauses.push("(s.id LIKE ? OR s.role LIKE ? OR s.cv_filename LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const order = sort === "score" ? "e.overall_score DESC NULLS LAST, s.created_at DESC"
              : sort === "duration" ? "COALESCE(s.ended_at, strftime('%s','now')) - s.created_at DESC"
              : "s.created_at DESC";

  const rows = query<SessionRow>(
    `SELECT s.*, e.overall_score, e.recommendation,
      (SELECT COUNT(*) FROM message_turns m WHERE m.session_id = s.id AND m.role = 'user') AS evaluated_turns
     FROM sessions s
     LEFT JOIN evaluations e ON e.session_id = s.id
     ${where}
     ORDER BY ${order}
     LIMIT ?`,
    [...params, limit],
  );

  return privateJson({ sessions: rows });
}

/* POST — atomic session creation (T-03.3). */
const SHA256_HEX = /^[a-f0-9]{64}$/;
const Body = modelConfigInput.extend({
  role: z.string().min(2).max(120),
  language: z.enum(["vi", "en"]),
  mode: z.enum(["strict", "coaching"]),
  plannedRounds: z.union([z.literal(5), z.literal(8), z.literal(12)]),
  cvSource: z.enum(["none", "paste", "pdf"]),
  // Server still length-checks cvText below; +100 headroom means the in-route
  // check produces a real "exceeds the 20,000 character limit" instead of a
  // generic Zod ceiling message.
  cvText: z.string().max(MAX_CV_CHARS + 100).optional(),
  cvFilename: z.string().max(200).optional(),
  // Doubled on purpose: an oversize body must reach the PDF validator and
  // be answered 413, not swallowed here as a Zod 400.
  cvDataUrl: z.string().min(1).max(MAX_PDF_DATA_URL_CHARS * 2).optional(),
  previewDigest: z.string().regex(SHA256_HEX).optional(),
}).strict();

interface ParsedBody {
  body: z.infer<typeof Body>;
  cfg: { provider: string; model: string; base_url: string | null; temperature: number; max_tokens: number; top_p: number };
}

function badRequest(message: string): Response {
  return privateJson({ ok: false, error: message }, { status: 400 });
}

function stalePreview(message: string): Response {
  return privateJson({ ok: false, error: message }, { status: 409 });
}

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;

  const release = enterOperation();
  if (!release) {
    return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  }
  try {
    const parsed = parseModelConfig(
      await req.json().catch(() => null),
      undefined,
      Body,
      { allowMissingKey: true },
    );
    if (!parsed.ok) return badRequest(parsed.error);
    const { body, cfg } = parsed as ParsedBody;

    const validationErr = validateStartSessionInput({
      role: body.role,
      language: body.language,
      mode: body.mode,
      planned_rounds: body.plannedRounds,
      cv_source: body.cvSource,
    });
    if (validationErr) return badRequest(validationErr);

    // Remember the preview digest exactly once; absent stays absent (none / paste / pdf).
    const previewDigest: string | null = body.previewDigest ?? null;

    // cvSource === "paste": validate text length and (optional) digest parity.
    if (body.cvSource === "paste") {
      if (!body.cvText || body.cvText.length === 0) {
        return badRequest("cvText required for cvSource=paste");
      }
      if (body.cvText.length > MAX_CV_CHARS) {
        return badRequest("cvText exceeds the 20,000 character limit");
      }
      if (previewDigest !== null && previewDigest !== fingerprintPaste(body.cvText)) {
        return stalePreview("Preview stale; please re-confirm your pasted text");
      }
    }

    // cvSource === "pdf": extract OUTSIDE the transaction so an async parser
    // never holds a SQLite write lock. The status/message comes straight from
    // PdfError; non-PdfError throws (e.g. parser failed to load) are server
    // faults and become a 500.
    let pdfPreview: PdfPreview | null = null;
    if (body.cvSource === "pdf") {
      if (!body.cvDataUrl) return badRequest("cvDataUrl required for cvSource=pdf");
      try {
        pdfPreview = await extractPdfPreview(body.cvDataUrl);
      } catch (err) {
        if (err instanceof PdfError) {
          return privateJson({ ok: false, error: err.message }, { status: err.status });
        }
        return privateJson({ ok: false, error: "PDF preview failed" }, { status: 500 });
      }
      if (previewDigest !== null && previewDigest !== pdfPreview.digest) {
        return stalePreview("Preview stale; please pick the PDF again and re-confirm");
      }
    }

    // Retry-on-collision: randomUUID() over 14 hex chars is statistically unique,
    // but if SQLite ever rejects a PK we restart with a fresh transaction
    // (never retry inside a held write transaction).
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = `sess_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      try {
        runInTransaction("IMMEDIATE", () => {
          exec(
            `INSERT INTO sessions (id, role, language, mode, planned_rounds, provider, model, base_url, temperature, max_tokens, top_p, cv_source, cv_filename)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              body.role.trim(),
              body.language,
              body.mode,
              body.plannedRounds,
              cfg.provider,
              cfg.model,
              cfg.base_url ?? null,
              cfg.temperature,
              cfg.max_tokens,
              cfg.top_p,
              body.cvSource,
              body.cvFilename ?? null,
            ],
          );

          if (body.cvSource === "paste" && body.cvText) {
            const text = body.cvText;
            exec(
              `INSERT INTO cv_extracts (session_id, source, filename, text, char_count) VALUES (?, 'paste', ?, ?, ?)`,
              [id, body.cvFilename ?? null, text, text.length],
            );
          } else if (body.cvSource === "pdf" && pdfPreview) {
            exec(
              `INSERT INTO cv_extracts (session_id, source, filename, text, char_count) VALUES (?, 'pdf', ?, ?, ?)`,
              [id, body.cvFilename ?? null, pdfPreview.text, pdfPreview.charCount],
            );
          }

          // Remember model config (provider is the key) — NFR-2: NEVER apiKey.
          exec(
            `INSERT INTO model_configs (provider, model, base_url, temperature, max_tokens, top_p)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(provider) DO UPDATE SET
               model = excluded.model,
               base_url = excluded.base_url,
               temperature = excluded.temperature,
               max_tokens = excluded.max_tokens,
               top_p = excluded.top_p,
               updated_at = unixepoch()`,
            [cfg.provider, cfg.model, cfg.base_url ?? null, cfg.temperature, cfg.max_tokens, cfg.top_p],
          );
        });
        return privateJson({ ok: true, sessionId: id });
      } catch (err) {
        const message = (err as Error).message ?? "";
        if (/UNIQUE constraint failed/i.test(message) && attempt < 2) continue;
        return privateJson({ ok: false, error: message || "Session creation failed" }, { status: 500 });
      }
    }
    // Exhausted retries without success — extremely unlikely.
    return privateJson({ ok: false, error: "Could not allocate session id" }, { status: 500 });
  } finally {
    release();
  }
}
