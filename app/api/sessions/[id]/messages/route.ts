import { NextResponse } from "next/server";
import { z } from "zod";
import { exec, query, queryOne } from "@/lib/db";
import { withCredentials, getProvider } from "@/lib/providers";
import {
  buildSystemPrompt,
  buildQuestionUserPrompt,
  buildEvaluationPrompt,
  type InterviewContext,
} from "@/lib/prompts";
import { parseEvaluation } from "@/lib/zod-schemas";
import {
  MAX_ANSWER_CHARS,
  requireApiKey,
  validateCustomBaseUrl,
} from "@/lib/validate";
import type { MessageTurnRow, SessionRow, ModelConfig, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().max(500).optional(),
  provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(1).default(0.4),
  maxTokens: z.number().int().min(64).max(32000).default(4096),
  topP: z.number().min(0).max(1).default(0.95),
  answer: z.string().min(0).max(MAX_ANSWER_CHARS + 200),
  finalize: z.boolean().optional(),
  earlyStop: z.boolean().optional(),
});

type SseEvent =
  | { type: "start"; turn: number; plan: { planned: number; completed: number }; mode: "strict" | "coaching" }
  | { type: "delta"; text: string }
  | { type: "coaching"; score: number; strengths: string[]; improvements: string[] }
  | { type: "persisted"; userTurn: number; assistantTurn: number }
  | { type: "error"; message: string; status?: number }
  | { type: "done"; reason: "next" | "complete" | "evaluating"; sessionId: string };

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request, { params }: RouteParams) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
  if (session.status === "completed")
    return NextResponse.json({ ok: false, error: "Session already completed" }, { status: 409 });

  if (body.answer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Answer exceeds ${MAX_ANSWER_CHARS} characters (FR-10)` },
      { status: 400 },
    );
  }
  if (body.provider === "custom") {
    const err = validateCustomBaseUrl(body.baseUrl ?? "");
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }
  const keyErr = requireApiKey(body.provider, body.apiKey);
  if (keyErr) return NextResponse.json({ ok: false, error: keyErr }, { status: 400 });

  const priorTurns = query<MessageTurnRow>(
    `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, id`,
    [params.id],
  );

  const completedUserTurns = priorTurns.filter((t) => t.role === "user").length;
  const nextUserTurn = completedUserTurns + 1;
  const isFinalize = !!body.finalize || !!body.earlyStop || nextUserTurn >= session.planned_rounds;

  const cv = queryOne<{ text: string }>(
    `SELECT text FROM cv_extracts WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    [params.id],
  );

  const historyBlock = priorTurns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => `[Turn ${t.turn_number} · ${t.role === "user" ? "Candidate" : "Interviewer"}]\n${t.content}`)
    .join("\n\n");

  const ctx: InterviewContext = {
    role: session.role,
    language: session.language,
    mode: session.mode,
    plannedRounds: session.planned_rounds,
    turnNumber: nextUserTurn,
    cvText: cv?.text,
  };

  const baseSystem = buildSystemPrompt(ctx);
  const userPrompt =
    nextUserTurn === 1 && priorTurns.length === 0
      ? buildQuestionUserPrompt(ctx, "")
      : `${historyBlock}\n\n[Candidate's latest answer]\n${body.answer}\n\n[Interviewer — produce the next question.]`;

  const cfg: ModelConfig = {
    provider: body.provider,
    model: body.model,
    base_url: body.baseUrl ?? null,
    temperature: body.temperature,
    max_tokens: body.maxTokens,
    top_p: body.topP,
  };
  const provider = getProvider(body.provider);
  const creds = withCredentials(cfg, body.apiKey, body.baseUrl);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const write = (e: unknown) => controller.enqueue(enc.encode(sse(e)));

      let fullText = "";
      try {
        write({
          type: "start",
          turn: nextUserTurn,
          plan: { planned: session.planned_rounds, completed: completedUserTurns },
          mode: session.mode,
        });

        // Persist user turn first so the history is durable even if streaming aborts.
        const userTurnId = `mt_${params.id}_u${nextUserTurn}`;
        exec(
          `INSERT OR REPLACE INTO message_turns (id, session_id, turn_number, role, content, raw_blocks_json, created_at)
           VALUES (?, ?, ?, 'user', ?, NULL, unixepoch())`,
          [userTurnId, params.id, nextUserTurn, body.answer || "(opener — no prior answer)"],
        );
        // Persist the synthesised prompt that the AI saw — useful for replay.
        exec(
          `INSERT OR REPLACE INTO message_turns (id, session_id, turn_number, role, content, raw_blocks_json, created_at)
           VALUES (?, ?, ?, 'system', ?, NULL, unixepoch())`,
          [`mt_${params.id}_u${nextUserTurn}_ctx`, params.id, nextUserTurn, userPrompt],
        );

        // Stream the AI response.
        const handle = await provider.streamChat(
          creds,
          [
            { role: "system", content: baseSystem },
            { role: "user", content: userPrompt },
          ],
          { abortSignal: req.signal },
        );

        try {
          for await (const chunk of handle.textStream) {
            fullText += chunk;
            write({ type: "delta", text: chunk });
          }
        } catch (e) {
          write({ type: "error", message: (e as Error).message });
          controller.close();
          return;
        }

        let meta: Awaited<typeof handle.meta> | null = null;
        try {
          meta = await handle.meta;
        } catch (e) {
          // Meta is best-effort; the user already has the text.
          meta = null;
        }

        // Coaching-mode per-turn micro-rubric. Single-shot completion, then parse.
        let coachingRubric: { score: number; strengths: string[]; improvements: string[] } | null = null;
        if (session.mode === "coaching" && body.answer) {
          const rubricPrompt = `You are a strict interview coach. Given the candidate's latest answer below, return ONLY a JSON object with this exact shape (no commentary, no markdown fences):
{"score": <integer 0-100>, "strengths": [<short bullet>, <short bullet>], "improvements": [<short bullet>, <short bullet>]}

Latest answer:
"""
${body.answer}
"""`;
          try {
            const rubricHandle = await provider.streamChat(creds, [
              { role: "system", content: rubricPrompt },
              { role: "user", content: "Return only the JSON." },
            ], { abortSignal: req.signal });
            const rubricText = await collectText(rubricHandle.textStream);
            coachingRubric = extractCoachingRubric(rubricText);
            if (coachingRubric) write({ type: "coaching", ...coachingRubric });
          } catch {
            // Coaching is best-effort; ignore failures.
          }
        }

        // Persist assistant turn.
        const asstTurnId = `mt_${params.id}_a${nextUserTurn}`;
        exec(
          `INSERT OR REPLACE INTO message_turns (id, session_id, turn_number, role, content, raw_blocks_json, latency_ms, prompt_tokens, completion_tokens, finish_reason, micro_rubric, created_at)
           VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
          [
            asstTurnId, params.id, nextUserTurn, fullText,
            meta ? JSON.stringify(meta.raw_blocks) : null,
            meta?.latency_ms ?? null,
            meta?.prompt_tokens ?? null,
            meta?.completion_tokens ?? null,
            meta?.finish_reason ?? null,
            coachingRubric ? JSON.stringify(coachingRubric) : null,
          ],
        );

        if (isFinalize) {
          exec(`UPDATE sessions SET status = 'evaluating', ended_at = unixepoch() WHERE id = ?`, [params.id]);
        }

        write({
          type: "persisted",
          userTurn: nextUserTurn,
          assistantTurn: nextUserTurn,
        });

        if (isFinalize) {
          try {
            await runEvaluation({
              sessionId: params.id,
              provider: body.provider,
              model: body.model,
              baseUrl: body.baseUrl,
              apiKey: body.apiKey,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
              topP: body.topP,
            });
          } catch (e) {
            write({ type: "error", message: `Evaluation failed: ${(e as Error).message}` });
          }
        }

        write({
          type: "done",
          reason: isFinalize ? "evaluating" : "next",
          sessionId: params.id,
        });
      } catch (e) {
        write({ type: "error", message: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "connection": "keep-alive",
    },
  });
}

async function collectText(it: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const s of it) out += s;
  return out;
}

function extractCoachingRubric(text: string): { score: number; strengths: string[]; improvements: string[] } | null {
  const fence = text.match(/\{[\s\S]*\}/);
  const candidate = fence ? fence[0] : text;
  try {
    const o = JSON.parse(candidate);
    if (typeof o.score !== "number") return null;
    return {
      score: Math.max(0, Math.min(100, Math.round(o.score))),
      strengths: Array.isArray(o.strengths) ? o.strengths.map(String).slice(0, 4) : [],
      improvements: Array.isArray(o.improvements) ? o.improvements.map(String).slice(0, 4) : [],
    };
  } catch {
    return null;
  }
}

/* ------- Evaluation runner (used from /messages when finalised and from /evaluate) ------ */
export async function runEvaluation(args: {
  sessionId: string;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}) {
  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [args.sessionId]);
  if (!session) throw new Error("Session not found");

  const turns = query<MessageTurnRow>(
    `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, id`,
    [args.sessionId],
  );
  // Build per-turn (question, answer, micro_rubric) tuples.
  const byTurn = new Map<number, { question?: string; answer?: string; micro_rubric?: string }>();
  for (const t of turns) {
    if (t.role === "user" || t.role === "assistant") {
      const bucket = byTurn.get(t.turn_number) ?? {};
      if (t.role === "user") bucket.answer = t.content;
      if (t.role === "assistant") {
        bucket.question = t.content;
        if (t.micro_rubric) {
          try {
            const r = JSON.parse(t.micro_rubric) as { strengths?: string[]; improvements?: string[]; score?: number };
            const parts: string[] = [];
            if (r.strengths?.length) parts.push(`Điểm tốt: ${r.strengths.join("; ")}`);
            if (r.improvements?.length) parts.push(`Cải thiện: ${r.improvements.join("; ")}`);
            if (typeof r.score === "number") parts.push(`/100`);
            if (parts.length) bucket.micro_rubric = parts.join(" · ");
          } catch { /* skip */ }
        }
      }
      byTurn.set(t.turn_number, bucket);
    }
  }
  const turnList = Array.from(byTurn.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({ question: v.question ?? "", answer: v.answer ?? "", micro_rubric: v.micro_rubric }));

  const cfg: ModelConfig = {
    provider: args.provider,
    model: args.model,
    base_url: args.baseUrl ?? null,
    temperature: 0.2,
    max_tokens: Math.max(args.maxTokens, 4096),
    top_p: 0.9,
  };
  const provider = getProvider(args.provider);
  const creds = withCredentials(cfg, args.apiKey, args.baseUrl);

  const prompt = buildEvaluationPrompt({
    role: session.role,
    language: session.language,
    turns: turnList,
  });

  const handle = await provider.streamChat(creds, [
    { role: "system", content: prompt },
    { role: "user", content: "Respond with JSON only. No commentary." },
  ], {});
  const text = await collectText(handle.textStream);
  // meta is best-effort; we don't need it for eval.

  const parsed = parseEvaluation(text);
  if (!parsed.ok) {
    exec(
      `INSERT OR REPLACE INTO evaluations (session_id, report_json, overall_score, recommendation, schema_valid, repair_attempts, created_at)
       VALUES (?, ?, 0, 'Needs Improvement', 0, 0, unixepoch())`,
      [args.sessionId, JSON.stringify({ raw: text, error: parsed.error })],
    );
    exec(`UPDATE sessions SET status = 'failed' WHERE id = ?`, [args.sessionId]);
    throw new Error(parsed.error);
  }

  const data = parsed.data;
  exec(
    `INSERT OR REPLACE INTO evaluations (session_id, report_json, overall_score, recommendation, schema_valid, repair_attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch())`,
    [
      args.sessionId,
      JSON.stringify(data),
      data.overall_score,
      data.recommendation,
      parsed.repaired ? 0 : 1,
      parsed.repaired ? 1 : 0,
    ],
  );
  exec(`UPDATE sessions SET status = 'completed' WHERE id = ?`, [args.sessionId]);
}
