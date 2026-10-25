import { z } from "zod";
import { exec, getDb, query, queryOne } from "@/lib/db";
import { getProvider } from "@/lib/providers";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { resolveSessionConfig } from "@/lib/providers/session-config";
import {
  buildSystemPrompt,
  buildQuestionUserPrompt,
  type InterviewContext,
} from "@/lib/prompts";
import { claimEvaluation, runEvaluation } from "@/lib/evaluation";
import { MAX_ANSWER_CHARS } from "@/lib/validate";
import type { MessageTurnRow, SessionRow } from "@/lib/types";
import { env } from "@/lib/env";
import { PRIVATE_HEADERS, privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { enterOperation } from "@/lib/maintenance";
import { parseStoredFocus } from "@/lib/focus";
import { recentCoveredTopics } from "@/lib/recent-topics";
import { MAX_QUESTION_CHARS, parseInterviewQuestion } from "@/lib/interview-question";
import { MAX_COACHING_CHARS, extractCoachingRubric } from "@/lib/coaching-rubric";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

const Body = modelConfigInput.extend({
  answer: z.string().min(0).max(MAX_ANSWER_CHARS + 200),
  finalize: z.boolean().optional(),
  earlyStop: z.boolean().optional(),
});

type SseEvent =
  | { type: "start"; turn: number; plan: { planned: number; completed: number }; mode: "strict" | "coaching" }
  | { type: "delta"; text: string }
  | { type: "coaching"; turn: number; score: number; strengths: string[]; improvements: string[] }
  | { type: "coaching_unavailable"; turn: number; message: string }
  | { type: "persisted"; userTurn: number; assistantTurn: number }
  | { type: "error"; message: string; status?: number }
  | { type: "done"; reason: "next" | "complete" | "evaluating"; sessionId: string };

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request, { params }: RouteParams) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const release = enterOperation();
  if (!release) return privateJson({ ok: false, error: "Database maintenance in progress" }, { status: 409 });
  let streamStarted = false;
  try {
  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const parsed = parseModelConfig(await req.json().catch(() => null), apiKey, Body);
  if (!parsed.ok) return privateJson({ ok: false, error: parsed.error }, { status: 400 });
  const { body, cfg } = parsed;

  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return privateJson({ ok: false, error: "Session not found" }, { status: 404 });
  if (session.status !== "active")
    return privateJson({ ok: false, error: "Session is not active" }, { status: 409 });
  const sessionConfig = resolveSessionConfig(session, cfg);
  if (!sessionConfig.ok) return privateJson({ ok: false, error: sessionConfig.error }, { status: 409 });
  const creds = sessionConfig.cfg;

  if (body.answer.length > MAX_ANSWER_CHARS) {
    return privateJson(
      { ok: false, error: `Answer exceeds ${MAX_ANSWER_CHARS} characters (FR-10)` },
      { status: 400 },
    );
  }
  const priorTurns = query<MessageTurnRow>(
    `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, id`,
    [params.id],
  );

  const questions = priorTurns.filter((t) => t.role === "assistant");
  const completedUserTurns = priorTurns.filter((t) => t.role === "user").length;
  const isOpener = questions.length === 0 && completedUserTurns === 0 && !body.answer.trim();
  const stopWithoutAnswer = !!body.earlyStop && !body.answer.trim() && completedUserTurns > 0;
  if (questions.length === completedUserTurns && completedUserTurns > 0) {
    return privateJson({ ok: false, error: "Wait for the next question before submitting an answer" }, { status: 409 });
  }
  if (isOpener && (body.earlyStop || body.finalize)) {
    return privateJson({ ok: false, error: "Start the interview before evaluating" }, { status: 400 });
  }
  if (!isOpener && !stopWithoutAnswer &&
      (questions.length !== completedUserTurns + 1 || !body.answer.trim())) {
    return privateJson({ ok: false, error: "Wait for a question before submitting an answer" }, { status: 409 });
  }
  if (stopWithoutAnswer && questions.length !== completedUserTurns + 1) {
    return privateJson({ ok: false, error: "Interview has no unanswered question" }, { status: 409 });
  }

  const answeredTurn = isOpener || stopWithoutAnswer ? completedUserTurns : completedUserTurns + 1;
  const questionTurn = isOpener ? 1 : answeredTurn + 1;
  const isFinalize = !isOpener && (!!body.finalize || !!body.earlyStop || answeredTurn >= session.planned_rounds);

  const cv = queryOne<{ text: string }>(
    `SELECT text FROM cv_extracts WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    [params.id],
  );

  const historyBlock = priorTurns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .sort((a, b) => a.turn_number - b.turn_number || (a.role === "assistant" ? -1 : 1))
    .map((t) => `[Turn ${t.turn_number} · ${t.role === "user" ? "Candidate" : "Interviewer"}]\n${t.content}`)
    .join("\n\n");

  const focus = parseStoredFocus(session.focus_json);
  // Cross-session topic memory: a new session should not open on a topic an
  // earlier session already covered. A session started from a lesson repeats
  // that lesson on purpose, so it keeps its own topic.
  const avoidTopics = isOpener && !session.origin_lesson_id
    ? recentCoveredTopics({ excludeSessionId: session.id, focus })
    : undefined;

  const ctx: InterviewContext = {
    role: session.role,
    language: session.language,
    mode: session.mode,
    plannedRounds: session.planned_rounds,
    turnNumber: questionTurn,
    focus,
    avoidTopics,
    cvText: cv?.text,
  };

  const baseSystem = buildSystemPrompt(ctx);
  const userPrompt = isOpener
    ? buildQuestionUserPrompt(ctx, "")
    : `${historyBlock}\n\n[Candidate's latest answer]\n${body.answer}\n\n[Interviewer — produce the next question for round ${questionTurn}/${session.planned_rounds}.]`;

  const provider = getProvider(creds.provider);

  const stream = new ReadableStream({
    async start(controller) {
      streamStarted = true;
      const enc = new TextEncoder();
      const write = (e: unknown) => {
        try { controller.enqueue(enc.encode(sse(e))); } catch { /* Client disconnected; finish persisted work. */ }
      };

      let fullText = "";
      let evaluationAttempt: string | null = null;
      try {
        write({
          type: "start",
          turn: isFinalize ? answeredTurn : questionTurn,
          plan: { planned: session.planned_rounds, completed: completedUserTurns },
          mode: session.mode,
        });

        let meta: Awaited<Awaited<ReturnType<typeof provider.streamChat>>["meta"]> | null = null;
        if (!isFinalize) {
          for (let attempt = 0; attempt < 2; attempt++) {
            if (req.signal.aborted) throw new Error("Question generation was cancelled");
            const handle = await provider.streamChat(
              creds,
              [
                { role: "system", content: baseSystem },
                { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\nYour previous response was unusable. Return exactly one interviewer question or interview task. Do not answer it, evaluate the candidate, assign a score, or continue the conversation.` },
              ],
              { abortSignal: req.signal },
            );
            let candidate = "";
            let oversized = false;
            // Never publish a provider chunk before checking that it is a question.
            // Bound collection even when a custom endpoint ignores max_tokens.
            for await (const chunk of handle.textStream) {
              if (candidate.length + chunk.length > MAX_QUESTION_CHARS) {
                oversized = true;
                break;
              }
              candidate += chunk;
            }
            // Breaking the iterator early must not leave meta unresolved forever.
            // Provider meta promises resolve after the stream finishes; no need to
            // await it when we already know the output is unusable.
            if (oversized) continue;
            const result = parseInterviewQuestion(candidate);
            try {
              meta = await handle.meta;
            } catch {
              meta = null;
            }
            const cutoff = /^(?:length|max_tokens|MAX_TOKENS)$/i.test(meta?.finish_reason ?? "");
            if (result.ok && !cutoff && !req.signal.aborted) {
              fullText = result.question;
              break;
            }
          }
          if (req.signal.aborted) throw new Error("Question generation was cancelled");
          if (!fullText) throw new Error("AI chưa tạo được câu hỏi hợp lệ sau khi thử lại. Câu trả lời của bạn chưa được lưu; hãy gửi lại.");
          write({ type: "delta", text: fullText });
        }

        let coachingRubric: ReturnType<typeof extractCoachingRubric> = null;
        let coachingFailure: string | null = null;
        const needsCoaching = session.mode === "coaching" && !isOpener && !stopWithoutAnswer;
        if (needsCoaching) {
          const question = questions.find((t) => t.turn_number === answeredTurn)?.content ?? "";
          const rubricPrompt = `You are a strict interview coach. Evaluate the candidate's answer to the interview question. Return ONLY a JSON object with this exact shape (no commentary, no markdown fences):
{"score": <integer 0-100>, "strengths": [<short bullet>, <short bullet>], "improvements": [<short bullet>, <short bullet>]}

Interview question:
"""
${question}
"""

Latest answer:
"""
${body.answer}
"""`;
          try {
            const rubricHandle = await provider.streamChat(creds, [
              { role: "system", content: rubricPrompt },
              { role: "user", content: "Return only the JSON." },
            ], { abortSignal: req.signal });
            const rubricText = await collectText(rubricHandle.textStream, MAX_COACHING_CHARS);
            const rubricMeta = await rubricHandle.meta;
            if (!/^(?:length|max_tokens|MAX_TOKENS)$/i.test(rubricMeta?.finish_reason ?? "")) {
              coachingRubric = extractCoachingRubric(rubricText);
            }
            if (!coachingRubric) coachingFailure = "AI không trả về góp ý hợp lệ cho câu này. Câu trả lời vẫn được lưu; bạn có thể tiếp tục.";
          } catch {
            coachingFailure = "Không tạo được góp ý cho câu này. Câu trả lời vẫn được lưu; bạn có thể tiếp tục.";
          }
        }

        const db = getDb();
        db.exec("BEGIN IMMEDIATE");
        try {
          const current = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
          const currentTurns = query<MessageTurnRow>(
            `SELECT * FROM message_turns WHERE session_id = ? ORDER BY turn_number, id`, [params.id],
          );
          const answered = currentTurns.filter((t) => t.role === "user").length;
          const asked = currentTurns.filter((t) => t.role === "assistant").length;
          if (current?.status !== "active" || answered !== completedUserTurns || asked !== questions.length) {
            throw new Error("Session changed while generating the question. Refresh and try again.");
          }

          if (!isOpener && !stopWithoutAnswer) {
            exec(
              `INSERT INTO message_turns (session_id, turn_number, role, content, created_at)
               VALUES (?, ?, 'user', ?, unixepoch())`,
              [params.id, answeredTurn, body.answer.trim()],
            );
            if (coachingRubric) {
              exec(
                `UPDATE message_turns SET micro_rubric = ? WHERE session_id = ? AND turn_number = ? AND role = 'assistant'`,
                [JSON.stringify(coachingRubric), params.id, answeredTurn],
              );
            }
          }
          if (!isFinalize) {
            exec(
              `INSERT INTO message_turns (session_id, turn_number, role, content, created_at)
               VALUES (?, ?, 'system', ?, unixepoch())`,
              [params.id, questionTurn, userPrompt],
            );
            exec(
              `INSERT INTO message_turns (session_id, turn_number, role, content, raw_blocks_json, latency_ms, prompt_tokens, completion_tokens, finish_reason, created_at)
               VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, unixepoch())`,
              [
                params.id, questionTurn, fullText,
                meta ? JSON.stringify(meta.raw_blocks) : null,
                meta?.latency_ms ?? null,
                meta?.prompt_tokens ?? null,
                meta?.completion_tokens ?? null,
                meta?.finish_reason ?? null,
              ],
            );
          }
          if (isFinalize) {
            evaluationAttempt = claimEvaluation(params.id);
            if (!evaluationAttempt) throw new Error("Could not start evaluation");
          } else if (req.signal.aborted) {
            throw new Error("Question generation was cancelled");
          }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }

        if (coachingRubric) write({ type: "coaching", turn: answeredTurn, ...coachingRubric });
        else if (needsCoaching) write({ type: "coaching_unavailable", turn: answeredTurn, message: coachingFailure ?? "Không tạo được góp ý cho câu này." });
        write({ type: "persisted", userTurn: answeredTurn, assistantTurn: isFinalize ? questions.length : questionTurn });

        if (evaluationAttempt) {
          try {
            await runEvaluation({
              sessionId: params.id,
              provider: creds.provider,
              model: creds.model,
              baseUrl: creds._base,
              apiKey,
            }, evaluationAttempt);
          } catch {
            write({ type: "error", message: "Không thể chấm điểm. Câu trả lời đã được lưu; bạn có thể thử lại." });
            return;
          }
        }

        write({
          type: "done",
          reason: isFinalize ? "complete" : "next",
          sessionId: params.id,
        });
      } catch (e) {
        write({ type: "error", message: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
        release();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      "referrer-policy": PRIVATE_HEADERS["referrer-policy"],
      "x-accel-buffering": "no",
      "connection": "keep-alive",
    },
  });
  } finally {
    // Once start() runs, it owns the lease through provider streaming, DB
    // persistence, and final evaluation (even if the client disconnects).
    if (!streamStarted) release();
  }
}

async function collectText(it: AsyncIterable<string>, maxChars: number): Promise<string> {
  let out = "";
  for await (const s of it) {
    if (out.length + s.length > maxChars) throw new Error("Coaching response is too long");
    out += s;
  }
  return out;
}
