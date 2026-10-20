import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { exec, query } from "@/lib/db";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import type { SessionRow } from "@/lib/types";
import { MAX_CV_CHARS, validateStartSessionInput } from "@/lib/validate";
import { extractPdfFromDataUrl } from "@/lib/pdf";

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

  return NextResponse.json({ sessions: rows });
}

/* POST — create a new session (FR-1, FR-2, FR-3, FR-4). */
const Body = modelConfigInput.extend({
  role: z.string().min(2).max(120),
  language: z.enum(["vi", "en"]),
  mode: z.enum(["strict", "coaching"]),
  plannedRounds: z.union([z.literal(5), z.literal(8), z.literal(12)]),
  cvSource: z.enum(["none", "paste", "pdf"]),
  cvText: z.string().max(MAX_CV_CHARS + 100).optional(),
  cvFilename: z.string().max(200).optional(),
  cvDataUrl: z.string().max(20_000_000).optional(), // base64 only, ~15MB pdf
});

export async function POST(req: Request) {
  const parsed = parseModelConfig(await req.json().catch(() => null), undefined, Body, { allowMissingKey: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { body, cfg } = parsed;

  // Field-level validation that needs aggregated context (e.g. role length after trim).
  const validationErr = validateStartSessionInput({
    role: body.role,
    language: body.language,
    mode: body.mode,
    planned_rounds: body.plannedRounds,
    cv_source: body.cvSource,
  });
  if (validationErr) return NextResponse.json({ ok: false, error: validationErr }, { status: 400 });

  const id = `sess_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

  try {
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
      const text = body.cvText.slice(0, MAX_CV_CHARS);
      exec(
        `INSERT INTO cv_extracts (session_id, source, filename, text, char_count) VALUES (?, 'paste', ?, ?, ?)`,
        [id, body.cvFilename ?? null, text, text.length],
      );
    } else if (body.cvSource === "pdf" && body.cvDataUrl) {
      const extracted = await extractPdfFromDataUrl(body.cvDataUrl);
      exec(
        `INSERT INTO cv_extracts (session_id, source, filename, text, char_count) VALUES (?, 'pdf', ?, ?, ?)`,
        [id, body.cvFilename ?? null, extracted.text, extracted.charCount],
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
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: id });
}
