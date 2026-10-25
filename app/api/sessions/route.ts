import { randomUUID } from "node:crypto";
import { z } from "zod";
import { exec, runInTransaction } from "@/lib/db";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { listSessions } from "@/lib/sessions-list";
import { MAX_CV_CHARS, validateStartSessionInput } from "@/lib/validate";
import { extractPdfPreview, fingerprintPaste, MAX_PDF_DATA_URL_CHARS, PdfError } from "@/lib/pdf";
// Type-only: erased at compile time, so this never drags lib/pdf's "server-only" import
// anywhere it does not belong.
import type { PdfPreview } from "@/lib/pdf";
import { env } from "@/lib/env";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { enterOperation } from "@/lib/maintenance";
import { FocusSchema } from "@/lib/focus";
import { readyPracticeLesson } from "@/lib/lesson-practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — paginated history list (FR-18).
 *
 * T-05.1: pagination is keyset-based (see lib/sessions-list.ts), not OFFSET-based.
 * This handler only parses the query string and shapes the envelope; the SQL and
 * cursor handling live in one place so they cannot drift apart. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const requestedLimit = Number(u.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50;

  const { sessions, nextCursor, hasMore } = listSessions({
    provider: u.searchParams.get("provider") || "all",
    status: u.searchParams.get("status") || "all",
    mode: u.searchParams.get("mode") || "all",
    q: (u.searchParams.get("q") || "").trim(),
    sort: u.searchParams.get("sort") || "newest",
    limit,
    cursor: u.searchParams.get("cursor"),
  });

  return privateJson({ sessions, nextCursor, hasMore, limit });
}

/* POST — atomic session creation (T-03.3). */
const SHA256_HEX = /^[a-f0-9]{64}$/;
const Body = modelConfigInput.extend({
  role: z.string().min(2).max(120),
  language: z.enum(["vi", "en"]),
  mode: z.enum(["strict", "coaching"]),
  plannedRounds: z.union([z.literal(5), z.literal(8), z.literal(12)]),
  focus: FocusSchema.default([]),
  originLessonId: z.string().uuid().optional(),
  // Tri-state for the lesson topic (RQ-L05: the user may edit or drop it):
  //   absent -> keep the lesson topic (legacy behaviour)
  //   null   -> the user dropped the lesson topic
  //   string -> the user replaced the lesson topic
  lessonFocus: z.string().trim().min(1).max(120).nullable().optional(),
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

const ORIGIN_UNAVAILABLE = "Origin lesson is unavailable";
const TOO_MANY_TOPICS = "Origin lesson is unavailable or too many added topics";
const LESSON_FOCUS_WITHOUT_ORIGIN = "lessonFocus requires an origin lesson";

/**
 * Resolve the focus list of a new session.
 *
 * The lesson topic occupies one of the three focus slots, and it is a suggestion
 * the user may edit or drop (RQ-L05) — the origin link itself always survives:
 *   - `lessonFocus` absent -> the lesson topic is kept (legacy behaviour)
 *   - `lessonFocus` null   -> the user dropped the lesson topic
 *   - `lessonFocus` "..."  -> the user replaced the lesson topic
 */
function resolveFocus(
  focus: string[],
  origin: { focus: string } | null,
  lessonFocus: string | null | undefined,
): { focus: string[] } | { error: string } {
  if (lessonFocus !== undefined && !origin) return { error: LESSON_FOCUS_WITHOUT_ORIGIN };
  const lessonTopic = lessonFocus === undefined ? (origin?.focus ?? null) : lessonFocus;
  if (focus.length + (lessonTopic ? 1 : 0) > 3) return { error: TOO_MANY_TOPICS };
  return { focus: lessonTopic ? [lessonTopic, ...focus] : [...focus] };
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
    // The lesson topic is a suggestion the user may edit or drop; the origin
    // link is kept either way. Validate before the expensive CV work.
    if (body.lessonFocus !== undefined && !body.originLessonId) {
      return badRequest(LESSON_FOCUS_WITHOUT_ORIGIN);
    }
    const origin = body.originLessonId ? readyPracticeLesson(body.originLessonId) : null;
    if (body.originLessonId && !origin) return badRequest(ORIGIN_UNAVAILABLE);
    const resolved = resolveFocus(body.focus, origin, body.lessonFocus);
    if ("error" in resolved) return badRequest(resolved.error);

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
          const origin = body.originLessonId ? readyPracticeLesson(body.originLessonId) : null;
          if (body.originLessonId && !origin) throw new Error(ORIGIN_UNAVAILABLE);
          // Re-derive the focus inside the transaction: the request body is not trusted.
          const resolved = resolveFocus(body.focus, origin, body.lessonFocus);
          if ("error" in resolved) throw new Error(resolved.error);
          exec(
            `INSERT INTO sessions (id, role, language, mode, planned_rounds, focus_json, origin_lesson_id, provider, model, base_url, temperature, max_tokens, top_p, cv_source, cv_filename)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              body.role.trim(),
              body.language,
              body.mode,
              body.plannedRounds,
              JSON.stringify(resolved.focus),
              origin?.id ?? null,
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
        if (message === ORIGIN_UNAVAILABLE || message === TOO_MANY_TOPICS ||
            message === LESSON_FOCUS_WITHOUT_ORIGIN) return badRequest(message);
        return privateJson({ ok: false, error: message || "Session creation failed" }, { status: 500 });
      }
    }
    // Exhausted retries without success — extremely unlikely.
    return privateJson({ ok: false, error: "Could not allocate session id" }, { status: 500 });
  } finally {
    release();
  }
}
