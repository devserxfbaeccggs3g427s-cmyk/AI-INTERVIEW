import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { claimLearningLesson, findLearningLesson, generateLearningLesson, lessonIsStale, type LearningLessonRow } from "@/lib/learning-generation";
import { LEARNING_REQUEST_MAX_BYTES } from "@/lib/learning-constants";
import { LearningModeSchema, SourceKindSchema } from "@/lib/learning-schema";
import { loadLearningSource } from "@/lib/learning-source";
import { enterOperation } from "@/lib/maintenance";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { resolveSessionConfig } from "@/lib/providers/session-config";
import type { SessionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface RouteParams { params: { id: string } }

const indexSchema = z.string().regex(/^\d{1,3}$/);
const querySchema = z.object({ kind: SourceKindSchema, index: indexSchema }).strict();
const generateSchema = z.object({
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  kind: SourceKindSchema,
  index: z.number().int().min(0).max(100),
  mode: LearningModeSchema,
  config: modelConfigInput.strict(),
  retry: z.literal(true).optional(),
}).strict();

/** Stream-read with a real byte cap, not an untrusted Content-Length alone. */
async function boundedBody(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > LEARNING_REQUEST_MAX_BYTES) throw new Error("oversize");
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch { throw new Error("invalid"); }
}

export async function GET(req: Request, { params }: RouteParams) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success || url.searchParams.size !== 2) {
    return privateJson({ error: "Invalid learning source" }, { status: 400 });
  }
  const kind = parsed.data.kind;
  const index = Number(parsed.data.index);
  const source = loadLearningSource(params.id, kind, index);
  if (!source) return privateJson({ error: "Learning source not found" }, { status: 404 });
  const session = queryOne<Pick<SessionRow, "provider" | "model" | "base_url" | "temperature" | "max_tokens" | "top_p">>(
    `SELECT provider,model,base_url,temperature,max_tokens,top_p FROM sessions WHERE id = ?`, [params.id],
  );
  if (!session) return privateJson({ error: "Learning source not found" }, { status: 404 });
  const modes = {} as Record<"fundamentals" | "answering", {
    id?: string; status: "uncreated" | "generating" | "failed" | "ready";
    claimedAt?: number; retryable: boolean;
  }>;
  for (const mode of LearningModeSchema.options) {
    const lesson = findLearningLesson(source, mode);
    modes[mode] = lesson
      ? { id: lesson.id, status: lesson.status, retryable: lesson.status === "failed" || lessonIsStale(lesson),
          ...(lesson.claimed_at == null ? {} : { claimedAt: lesson.claimed_at }) }
      : { status: "uncreated", retryable: false };
  }
  const older = query<Pick<LearningLessonRow, "id" | "mode" | "source_label" | "created_at">>(
    `SELECT id, mode, source_label, created_at FROM learning_lessons
     WHERE session_id = ? AND source_kind = ? AND source_index = ?
       AND report_revision <> ? AND status = 'ready' ORDER BY created_at DESC LIMIT 20`,
    [params.id, kind, index, source.reportRevision],
  ).map((lesson) => ({ id: lesson.id, mode: lesson.mode, label: lesson.source_label, createdAt: lesson.created_at }));
  return privateJson({
    source: { kind, index, label: source.kind === "improvement" ? source.source : source.label,
      ...(typeof source.source === "string" ? {} : {
        description: source.source.description, duration: source.source.duration,
      }), role: source.role, language: source.language, revision: source.reportRevision,
      provider: session.provider, model: session.model,
      temperature: session.temperature, maxTokens: session.max_tokens, topP: session.top_p,
      ...(session.base_url ? { baseUrl: session.base_url } : {}) },
    modes, older,
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const release = enterOperation();
  if (!release) return privateJson({ error: "Database maintenance in progress" }, { status: 409 });
  try {
    let raw: unknown;
    try { raw = await boundedBody(req); }
    catch (error) { return privateJson({ error: "Invalid request body" }, { status: (error as Error).message === "oversize" ? 413 : 400 }); }
    const body = generateSchema.safeParse(raw);
    if (!body.success) return privateJson({ error: "Invalid learning request" }, { status: 400 });
    const { kind, index, mode, revision, retry } = body.data;
    const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
    if (!session || session.status !== "completed") {
      return privateJson({ error: "Completed session not found" }, { status: 404 });
    }
    const source = loadLearningSource(params.id, kind, index);
    if (!source) return privateJson({ error: "Learning source not found" }, { status: 404 });
    if (source.reportRevision !== revision) return privateJson({ error: "Report changed. Reload this topic." }, { status: 409 });
    const apiKey = req.headers.get("x-api-key") ?? undefined;
    const parsed = parseModelConfig(body.data.config, apiKey, modelConfigInput.strict());
    if (!parsed.ok) return privateJson({ error: "Restore the original provider configuration and enter its API key." }, { status: 400 });
    const resolved = resolveSessionConfig(session, parsed.cfg);
    if (!resolved.ok) return privateJson({ error: "Provider configuration differs from the original session." }, { status: 409 });
    const claimed = claimLearningLesson(source, mode, resolved.cfg, retry === true);
    if (claimed.kind === "changed") return privateJson({ error: "Report or lesson changed. Reload this topic." }, { status: 409 });
    if (claimed.kind === "retry-required") return privateJson({ id: claimed.id, status: "failed", error: "Choose retry to try again; a previous call may have incurred a charge." }, { status: 409 });
    if (claimed.kind === "existing") return privateJson({ id: claimed.id, status: claimed.status });
    const status = await generateLearningLesson(source, mode, resolved.cfg, claimed.id, claimed.claimId);
    if (status === "changed") return privateJson({ error: "Report or lesson changed. Reload this topic." }, { status: 409 });
    if (status === "failed") return privateJson({ id: claimed.id, status, error: "Could not create lesson. A provider call may have incurred a charge; retry manually." }, { status: 502 });
    return privateJson({ id: claimed.id, status });
  } catch {
    return privateJson({ error: "Could not create lesson. Please try again." }, { status: 500 });
  } finally { release(); }
}
