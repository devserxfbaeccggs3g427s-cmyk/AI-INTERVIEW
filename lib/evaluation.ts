import { randomUUID } from "node:crypto";
import { exec, getDb, query, queryOne } from "@/lib/db";
import { withCredentials, getProvider } from "@/lib/providers";
import { buildEvaluationPrompt } from "@/lib/prompts";
import type { MessageTurnRow, ModelConfig, ProviderId, SessionRow } from "@/lib/types";
import type { AuthedConfig, Provider } from "@/lib/providers/types";
import { parseEvaluation } from "@/lib/zod-schemas";
import {
  EVALUATION_MAX_TOKENS,
  EVALUATION_RETRY_MAX_TOKENS,
  EVALUATION_STALE_AFTER_MS,
  EVALUATION_TIMEOUT_MS,
} from "./evaluation-constants";

export { EVALUATION_STALE_AFTER_MS, EVALUATION_TIMEOUT_MS };

/**
 * Provider `finish_reason` values meaning "output was cut off before the JSON
 * closed". OpenAI-compatible servers say `length`, Anthropic says
 * `max_tokens`, Gemini says `MAX_TOKENS`. Treating these as ordinary parse
 * failures is what made scoring look broken: the JSON was cut mid-object and
 * the only symptom was "Invalid evaluation response".
 */
const TRUNCATED_BY_LENGTH = new Set(["length", "max_tokens", "MAX_TOKENS", "max_output_tokens"]);

/** Guard against a runaway model filling SQLite with one enormous row. */
const MAX_STORED_RAW_CHARS = 256_000;

export interface EvaluationConfig {
  sessionId: string;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export function evaluationIsStale(session: SessionRow): boolean {
  return session.status === "evaluating" &&
    (session.evaluation_started_at == null ||
      Date.now() - session.evaluation_started_at * 1000 >= EVALUATION_STALE_AFTER_MS);
}

export function claimEvaluation(sessionId: string, retry = false): string | null {
  const attemptId = randomUUID();
  const staleBefore = Math.floor((Date.now() - EVALUATION_STALE_AFTER_MS) / 1000);
  const result = getDb().prepare(
    `UPDATE sessions SET status = 'evaluating', evaluation_started_at = unixepoch(),
       evaluation_attempt_id = ?, ended_at = COALESCE(ended_at, unixepoch())
     WHERE id = ? AND (
       status = 'active' AND ? = 0 OR
       ? = 1 AND (status = 'failed' OR
         status = 'evaluating' AND (evaluation_started_at IS NULL OR evaluation_started_at <= ?))
     )`,
  ).run(attemptId, sessionId, Number(retry), Number(retry), staleBefore);
  return result.changes === 1 ? attemptId : null;
}

interface AttemptOutcome {
  outcome: "completed" | "failed";
  maxTokens: number;
  finishReason?: string;
  responseChars: number;
  rawResponse?: string;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Appends to the audit trail. Both budget attempts of one claim share the same
 * `attempt_id`, so the table shows every provider round-trip behind a single
 * evaluation. Never throws: diagnostics must not be the reason scoring fails.
 */
function recordAttempt(sessionId: string, attemptId: string, row: AttemptOutcome): void {
  try {
    exec(
      `INSERT INTO evaluation_attempts
         (session_id, attempt_id, outcome, max_tokens, finish_reason, response_chars,
          raw_response, error_message, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      [
        sessionId, attemptId, row.outcome, row.maxTokens, row.finishReason ?? null,
        row.responseChars,
        row.rawResponse ? row.rawResponse.slice(0, MAX_STORED_RAW_CHARS) : null,
        row.errorMessage ? row.errorMessage.slice(0, 2000) : null,
        row.durationMs,
      ],
    );
  } catch {
    /* Best-effort audit log — never fail the evaluation over it. */
  }
}

interface ModelResult {
  text: string;
  finishReason?: string;
  latencyMs: number;
}

/** One provider round-trip against the report prompt. */
async function callEvaluationModel(
  provider: Provider,
  creds: AuthedConfig,
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<ModelResult> {
  const handle = await provider.streamChat(
    creds,
    [
      { role: "system", content: prompt },
      { role: "user", content: "Respond with JSON only. No commentary." },
    ],
    // max_tokens is set in BOTH places on purpose: every current provider reads
    // `opts.maxTokens ?? cfg.max_tokens`, and this keeps the budget correct if a
    // future one only consults the config.
    { abortSignal: signal, maxTokens },
  );
  let text = "";
  for await (const chunk of handle.textStream) text += chunk;
  // `meta` settles when the stream closes and carries finish_reason — the only
  // reliable signal that a body was truncated rather than merely malformed.
  let meta: Awaited<typeof handle.meta> | undefined;
  try {
    meta = await handle.meta;
  } catch {
    meta = undefined; // Best-effort; missing meta must not sink a good report.
  }
  return { text, finishReason: meta?.finish_reason, latencyMs: meta?.latency_ms ?? 0 };
}

/** Races `run` against `ms`, aborting the underlying request on timeout. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new Error("Evaluation timed out"));
    }, ms);
  });
  try {
    return await Promise.race([run(abort.signal), expiry]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runEvaluation(args: EvaluationConfig, attemptId: string): Promise<void> {
  try {
    const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [args.sessionId]);
    if (!session || session.status !== "evaluating" || session.evaluation_attempt_id !== attemptId) {
      throw new Error("Evaluation attempt is no longer active");
    }
    if (args.provider !== session.provider || args.model !== session.model ||
        (session.provider === "custom" && (!session.base_url || args.baseUrl !== session.base_url))) {
      throw new Error("Evaluation configuration differs from the original session");
    }
    const turns = query<MessageTurnRow>(
      `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, id`,
      [args.sessionId],
    );
    const byTurn = new Map<number, { question?: string; answer?: string; micro_rubric?: string }>();
    for (const turn of turns) {
      if (turn.role !== "user" && turn.role !== "assistant") continue;
      const bucket = byTurn.get(turn.turn_number) ?? {};
      if (turn.role === "user") bucket.answer = turn.content;
      if (turn.role === "assistant") {
        bucket.question = turn.content;
        if (turn.micro_rubric) {
          try {
            const rubric = JSON.parse(turn.micro_rubric) as { strengths?: string[]; improvements?: string[]; score?: number };
            const parts: string[] = [];
            if (rubric.strengths?.length) parts.push(`Điểm tốt: ${rubric.strengths.join("; ")}`);
            if (rubric.improvements?.length) parts.push(`Cải thiện: ${rubric.improvements.join("; ")}`);
            if (typeof rubric.score === "number") parts.push("/100");
            if (parts.length) bucket.micro_rubric = parts.join(" · ");
          } catch { /* Ignore malformed historical feedback. */ }
        }
      }
      byTurn.set(turn.turn_number, bucket);
    }
    const turnList = Array.from(byTurn.entries())
      .sort(([a], [b]) => a - b)
      .map(([, turn]) => ({
        question: turn.question ?? "", answer: turn.answer ?? "", micro_rubric: turn.micro_rubric,
      }));
    if (!turnList.some((turn) => turn.answer)) throw new Error("No answered turns to evaluate");

    const baseCfg: ModelConfig = {
      provider: args.provider,
      model: args.model,
      base_url: session.provider === "custom" ? session.base_url : null,
      temperature: 0.2,
      max_tokens: EVALUATION_MAX_TOKENS,
      top_p: 0.9,
    };
    const prompt = buildEvaluationPrompt({
      role: session.role,
      language: session.language,
      turns: turnList,
    });
    const provider = getProvider(args.provider);

    // Truncation is the dominant failure mode, so the first budget is generous
    // and the second is a one-shot escalation. Escalate on a schema mismatch
    // too: at temperature 0.2 a resample usually lands differently, and that is
    // cheaper than making the user click "chấm điểm lại" again. Bounded at two
    // round-trips per claim so a pathological provider cannot loop.
    let parsed: ReturnType<typeof parseEvaluation> | null = null;
    let lastFailure = "Evaluation produced no usable report";

    for (const maxTokens of [EVALUATION_MAX_TOKENS, EVALUATION_RETRY_MAX_TOKENS]) {
      const startedAt = Date.now();
      let result: ModelResult;
      try {
        result = await withTimeout(EVALUATION_TIMEOUT_MS, (signal) =>
          callEvaluationModel(
            provider,
            withCredentials({ ...baseCfg, max_tokens: maxTokens }, args.apiKey,
              session.provider === "custom" ? args.baseUrl : undefined),
            prompt, maxTokens, signal,
          ));
      } catch (error) {
        // A timeout or transport failure is not budget-shaped: a bigger ceiling
        // would not have helped, so record it and propagate immediately.
        recordAttempt(args.sessionId, attemptId, {
          outcome: "failed", maxTokens, responseChars: 0,
          errorMessage: (error as Error).message, durationMs: Date.now() - startedAt,
        });
        throw error;
      }

      const attempt = parseEvaluation(result.text);
      if (attempt.ok) {
        parsed = attempt;
        recordAttempt(args.sessionId, attemptId, {
          outcome: "completed", maxTokens, finishReason: result.finishReason,
          responseChars: result.text.length, rawResponse: result.text,
          durationMs: Date.now() - startedAt,
        });
        break;
      }

      const truncated = TRUNCATED_BY_LENGTH.has(result.finishReason ?? "");
      lastFailure = truncated
        ? `Model stopped on length at ${maxTokens} tokens; JSON was incomplete.`
        : `Response did not match the report schema: ${attempt.error}`;
      recordAttempt(args.sessionId, attemptId, {
        outcome: "failed", maxTokens, finishReason: result.finishReason,
        responseChars: result.text.length, rawResponse: result.text,
        errorMessage: lastFailure, durationMs: Date.now() - startedAt,
      });
    }
    if (!parsed || !parsed.ok) throw new Error(lastFailure);

    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const claimed = db.prepare(
        `UPDATE sessions SET status = 'completed', evaluation_started_at = NULL
         WHERE id = ? AND status = 'evaluating' AND evaluation_attempt_id = ?`,
      ).run(args.sessionId, attemptId);
      if (claimed.changes !== 1) throw new Error("Evaluation attempt is no longer active");
      exec(
        `INSERT INTO evaluations (session_id, report_json, overall_score, recommendation, schema_valid, repair_attempts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, unixepoch())
         ON CONFLICT(session_id) DO UPDATE SET
           report_json = excluded.report_json, overall_score = excluded.overall_score,
           recommendation = excluded.recommendation, schema_valid = excluded.schema_valid,
           repair_attempts = excluded.repair_attempts, created_at = excluded.created_at`,
        [args.sessionId, JSON.stringify(parsed.data), parsed.data.overall_score,
          parsed.data.recommendation, parsed.repaired ? 0 : 1, parsed.repaired ? 1 : 0],
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    exec(
      `UPDATE sessions SET status = 'failed', evaluation_started_at = NULL, error_count = error_count + 1
       WHERE id = ? AND status = 'evaluating' AND evaluation_attempt_id = ?`,
      [args.sessionId, attemptId],
    );
    throw error;
  }
}
