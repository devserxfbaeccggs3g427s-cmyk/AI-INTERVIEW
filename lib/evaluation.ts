import { randomUUID } from "node:crypto";
import { exec, getDb, query, queryOne } from "@/lib/db";
import { withCredentials, getProvider } from "@/lib/providers";
import { buildEvaluationPrompt } from "@/lib/prompts";
import type { MessageTurnRow, ModelConfig, ProviderId, SessionRow } from "@/lib/types";
import { parseEvaluation } from "@/lib/zod-schemas";

export const EVALUATION_TIMEOUT_MS = 90_000;
export const EVALUATION_STALE_AFTER_MS = 120_000;

export interface EvaluationConfig {
  sessionId: string;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens: number;
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

    const cfg: ModelConfig = {
      provider: args.provider,
      model: args.model,
      base_url: session.provider === "custom" ? session.base_url : null,
      temperature: 0.2,
      max_tokens: Math.max(args.maxTokens, 4096),
      top_p: 0.9,
    };
    const prompt = buildEvaluationPrompt({
      role: session.role,
      language: session.language,
      turns: turnList,
    });
    const provider = getProvider(args.provider);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new Error("Evaluation timed out"));
      }, EVALUATION_TIMEOUT_MS);
    });
    const text = await Promise.race([(async () => {
      const handle = await provider.streamChat(withCredentials(cfg, args.apiKey, session.provider === "custom" ? args.baseUrl : undefined), [
        { role: "system", content: prompt },
        { role: "user", content: "Respond with JSON only. No commentary." },
      ], { abortSignal: abort.signal });
      let result = "";
      for await (const chunk of handle.textStream) result += chunk;
      return result;
    })(), timeout]).finally(() => clearTimeout(timer));
    const parsed = parseEvaluation(text);
    if (!parsed.ok) throw new Error("Invalid evaluation response");

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
