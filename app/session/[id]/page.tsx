"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useByok } from "@/components/ByokConfigContext";
import { Chip } from "@/components/Chip";
import { DifficultyBadge, difficultyForRound } from "@/components/DifficultyBadge";
import { useStreamingChat } from "@/lib/useStreamingChat";
import { renderMarkdown } from "@/lib/markdown";
import type { SessionRow, MessageTurnRow } from "@/lib/types-shared";

interface Props { params: { id: string } }

const MAX_ANSWER = 4000;

interface UiMessage {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  streaming?: boolean;
  difficulty?: "L3-Junior" | "L4-Mid" | "L5-Senior" | "Staff";
  coaching?: { score: number; strengths: string[]; improvements: string[] } | null;
  turnNumber: number;
  ts: number;
}

export default function ActiveSessionPage({ params }: Props) {
  const router = useRouter();
  const { cfg } = useByok();
  const { streaming, error, submit, stop } = useStreamingChat();

  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [plan, setPlan] = useState<{ planned: number; completed: number; turn: number } | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "error" | "evaluating" | "completed" | "evaluating-then-redirect">("loading");
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [showEarlyStopConfirm, setShowEarlyStopConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${params.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setSession(json.session);
        setPlan({
          planned: json.session.planned_rounds,
          completed: json.turns.filter((t: MessageTurnRow) => t.role === "user").length,
          turn: json.turns.filter((t: MessageTurnRow) => t.role === "user").length + 1,
        });
        const ui: UiMessage[] = [];
        let lastQ = 0;
        for (const t of json.turns as MessageTurnRow[]) {
          if (t.role === "assistant") {
            lastQ = t.turn_number;
            ui.push({
              id: `${t.id}`,
              role: "interviewer",
              content: t.content,
              difficulty: difficultyForRound(t.turn_number ?? 1, json.session.planned_rounds),
              turnNumber: t.turn_number,
              ts: t.id,
            });
          } else if (t.role === "user" && t.turn_number === lastQ) {
            ui.push({ id: `${t.id}`, role: "candidate", content: t.content, turnNumber: t.turn_number, ts: t.id });
          }
        }
        setMessages(ui);
        if (json.session.status === "completed") setStage("completed");
        else if (json.session.status === "evaluating") setStage("evaluating");
        else setStage("ready");
      } catch (e) {
        if (!alive) return;
        setBootErr((e as Error).message);
        setStage("error");
      }
    })();
    return () => { alive = false; };
  }, [params.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendAnswer = async (earlyStop = false) => {
    if (streaming) return;
    if (!session) return;
    if (!answer.trim() && !earlyStop) return;

    // Optimistically show candidate's message
    const candidateUiId = `cand-${Date.now()}`;
    if (answer.trim()) {
      setMessages((m) => [...m, { id: candidateUiId, role: "candidate", content: answer, turnNumber: plan?.turn ?? 1, ts: Date.now() }]);
    }

    const placeholderId = `int-${Date.now()}`;
    setMessages((m) => [...m, { id: placeholderId, role: "interviewer", content: "", streaming: true,
      difficulty: difficultyForRound(plan?.turn ?? 1, plan?.planned ?? 8), turnNumber: plan?.turn ?? 1, ts: Date.now() }]);

    let accum = "";
    try {
      await submit({
        sessionId: session.id,
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        topP: cfg.topP,
        answer: answer.trim() || "(no answer — early stop requested)",
        earlyStop,
      }, {
        onStart: ({ turn, plan: p, mode }) => {
          setPlan({ planned: p.planned, completed: p.completed, turn });
          setStage("ready");
        },
        onDelta: (chunk) => {
          accum += chunk;
          setMessages((m) => m.map((mm) => mm.id === placeholderId ? { ...mm, content: accum } : mm));
        },
        onCoaching: (rubric) => {
          setMessages((m) => m.map((mm) => mm.id === placeholderId ? { ...mm, coaching: rubric } : mm));
        },
        onPersisted: ({ userTurn, assistantTurn }) => {
          setPlan((p) => p ? { ...p, completed: userTurn, turn: userTurn + 1 } : p);
        },
        onDone: ({ reason }) => {
          setMessages((m) => m.map((mm) => mm.id === placeholderId ? { ...mm, streaming: false } : mm));
          if (reason === "evaluating") {
            setStage("evaluating-then-redirect");
            // poll until session status flips to "completed"
            let attempts = 0;
            const tick = setInterval(async () => {
              attempts++;
              try {
                const r = await fetch(`/api/sessions/${params.id}`);
                const j = await r.json();
                if (j.session?.status === "completed") {
                  clearInterval(tick);
                  router.push(`/report/${params.id}`);
                } else if (j.session?.status === "failed") {
                  clearInterval(tick);
                  setStage("ready");
                }
              } catch { /* ignore */ }
              if (attempts > 60) { clearInterval(tick); setStage("ready"); }
            }, 1500);
          }
        },
      });
    } catch {
      // error already set by hook
      setMessages((m) => m.filter((mm) => mm.id !== placeholderId));
    } finally {
      setAnswer("");
      setShowEarlyStopConfirm(false);
    }
  };

  if (stage === "loading") {
    return <div className="w-full px-gutter py-space-xl text-center text-on-surface-variant">Đang tải phiên…</div>;
  }
  if (stage === "error") {
    return (
      <div className="w-full px-gutter py-space-xl text-center">
        <h1 className="font-headline-lg text-headline-lg text-error">Không tải được phiên</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-sm">{bootErr}</p>
        <a href="/history" className="btn btn-ghost mt-space-md">Về lịch sử</a>
      </div>
    );
  }

  if (!session) return null;

  const pct = plan ? Math.round((plan.completed / plan.planned) * 100) : 0;

  return (
    <div className="w-full h-[calc(100vh-4rem)] flex">
      {/* Sidebar (left) — 280px */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-r" style={{ borderColor: "var(--border-hairline)" }}>
        <div className="p-space-md flex flex-col gap-space-md">
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="label-caps text-tertiary uppercase">Session</span>
              <Chip tone="indigo">{session.id}</Chip>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface mt-1">{session.role}</h2>
            <p className="label-code-sm text-on-surface-variant mt-1">
              {session.language === "vi" ? "Tiếng Việt" : "English"} · {session.mode === "coaching" ? "Coaching" : "Strict"}
            </p>
          </div>

          <div className="card p-space-sm flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <span className="label-caps text-on-surface-variant uppercase">Tiến trình</span>
              <span className="label-code-sm text-tertiary">{plan?.completed ?? 0} / {plan?.planned ?? 0}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-container-lowest overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between label-code-sm text-on-surface-variant">
              <span>Câu hiện tại: {plan?.turn ?? 1}</span>
              <span>{pct}%</span>
            </div>
          </div>

          <div className="card p-space-sm flex flex-col gap-space-xs">
            <span className="label-caps text-on-surface-variant uppercase">AI Provider</span>
            <div className="flex items-center gap-space-sm">
              <span className="w-2 h-2 rounded-full bg-tertiary pulse-dot" />
              <span className="label-code-sm text-on-surface">{session.provider}</span>
            </div>
            <div className="label-code-sm text-on-surface-variant">{session.model}</div>
            <div className="label-code-sm text-on-surface-variant">Temp {session.temperature} · TopP {session.top_p} · {session.max_tokens} tok</div>
          </div>

          {session.cv_source !== "none" ? (
            <div className="card p-space-sm flex flex-col gap-space-xs">
              <span className="label-caps text-on-surface-variant uppercase">CV nguồn</span>
              <span className="label-code-sm text-on-surface">{session.cv_filename ?? "(paste)"}</span>
              <span className="label-code-sm text-on-surface-variant">{session.cv_source}</span>
            </div>
          ) : null}

          <button
            onClick={() => {
              if (confirm("Dừng phiên này? Transcript hiện tại sẽ được giữ nguyên trong SQLite.")) {
                fetch(`/api/sessions/${session.id}`, { method: "DELETE" }).then(() => router.push("/history"));
              }
            }}
            className="btn btn-destructive w-full mt-auto"
          >
            <span className="material-symbols-outlined text-[18px]">close</span> Hủy phiên
          </button>
        </div>
      </aside>

      {/* Center: conversation stream */}
      <section className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto scrollbar-thin px-gutter py-space-md" ref={scrollRef}>
          <div className="max-w-3xl mx-auto flex flex-col gap-space-md">
            {messages.length === 0 ? (
              <div className="card p-space-md text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] text-primary">play_circle</span>
                <p className="mt-2">Bấm "Bắt đầu" để AI đặt câu hỏi mở đầu.</p>
              </div>
            ) : null}
            {messages.map((m) => <Bubble key={m.id} msg={m} />)}
            {error ? <ErrorBanner message={error.message} /> : null}
            {stage === "evaluating" || stage === "evaluating-then-redirect" ? <EvaluatingBanner /> : null}
            {stage === "completed" ? <CompletedBanner sessionId={params.id} /> : null}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t" style={{ borderColor: "var(--border-hairline)" }}>
          <div className="max-w-3xl mx-auto px-gutter py-space-md flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="label-caps text-on-surface-variant uppercase">Câu trả lời của bạn</span>
                <span className="label-code-sm text-on-surface-variant">{answer.length} / {MAX_ANSWER}</span>
              </div>
              {plan && plan.completed > 0 ? (
                <button onClick={() => setShowEarlyStopConfirm((v) => !v)} className="btn btn-ghost text-error" style={{ borderColor: "rgba(244,63,94,0.5)", color: "var(--destructive)" }}>
                  <span className="material-symbols-outlined text-[18px]">stop_circle</span> Dừng sớm & chấm điểm
                </button>
              ) : null}
            </div>
            <textarea
              className="input min-h-[120px] resize-y"
              placeholder="Trả lời câu hỏi phỏng vấn… (tối đa 4.000 ký tự)"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, MAX_ANSWER))}
              disabled={streaming || stage === "evaluating-then-redirect" || stage === "completed"}
              maxLength={MAX_ANSWER}
            />
            {showEarlyStopConfirm ? (
              <div className="card p-space-sm flex items-center justify-between" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                <span className="font-body-sm text-body-sm text-error">
                  Dừng sớm sẽ tạo báo cáo ngay với số câu đã trả lời. Bạn có chắc?
                </span>
                <div className="flex gap-space-sm">
                  <button onClick={() => setShowEarlyStopConfirm(false)} className="btn btn-ghost">Hủy</button>
                  <button onClick={() => sendAnswer(true)} className="btn btn-destructive">Dừng & chấm điểm</button>
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm label-code-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
                <span>API Key không bao giờ chạm vào SQLite / log</span>
              </div>
              <div className="flex gap-space-sm">
                {streaming ? (
                  <button onClick={stop} className="btn btn-ghost">
                    <span className="material-symbols-outlined text-[18px]">stop</span> Dừng stream
                  </button>
                ) : null}
                <button
                  onClick={() => sendAnswer(false)}
                  disabled={streaming || !answer.trim() || stage !== "ready"}
                  className="btn btn-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span> Gửi
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right drawer: live coaching rubric */}
      {session.mode === "coaching" ? (
        <aside className="hidden xl:flex flex-col w-[340px] flex-shrink-0 border-l" style={{ borderColor: "var(--border-hairline)" }}>
          <div className="p-space-md flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="label-caps text-tertiary uppercase">Live Coaching</span>
              <Chip tone="emerald">Per-turn rubric</Chip>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Sau mỗi câu trả lời, AI sẽ chấm 1-10, highlight điểm mạnh và lỗ hổng ngay tại đây.
            </p>
            <div className="flex flex-col gap-space-sm">
              {messages.filter((m) => m.role === "interviewer" && m.coaching).slice().reverse().map((m) => (
                <div key={m.id} className="card p-space-md flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-on-surface uppercase">Câu {m.turnNumber}</span>
                    <span className="label-code-sm text-tertiary">{m.coaching!.score}/10</span>
                  </div>
                  <RubricBar score={m.coaching!.score} />
                  <div className="flex flex-col gap-space-xs">
                    <span className="label-caps text-tertiary uppercase">Điểm mạnh</span>
                    {m.coaching!.strengths.map((s, i) => (
                      <div key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                        <span className="material-symbols-outlined text-[14px] text-tertiary flex-shrink-0 mt-1">check_circle</span>{s}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-space-xs">
                    <span className="label-caps text-warning uppercase">Cải thiện</span>
                    {m.coaching!.improvements.map((s, i) => (
                      <div key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                        <span className="material-symbols-outlined text-[14px] text-warning flex-shrink-0 mt-1">lightbulb</span>{s}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function Bubble({ msg }: { msg: UiMessage }) {
  if (msg.role === "interviewer") {
    return (
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-sm">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[16px]">psychology</span>
          </div>
          <span className="label-caps text-tertiary uppercase">Interviewer · Câu {msg.turnNumber}</span>
          {msg.difficulty ? <DifficultyBadge tier={msg.difficulty} /> : null}
        </div>
        <div className="card-elevated p-space-md ai-prose">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || "") }} />
          {msg.streaming ? <span className="streaming-cursor" /> : null}
        </div>
        {msg.coaching ? (
          <div className="card p-space-md flex flex-col gap-space-sm" style={{ borderColor: "var(--tertiary)" }}>
            <div className="flex items-center justify-between">
              <span className="label-caps text-tertiary uppercase">Coaching rubric</span>
              <span className="label-code-sm text-tertiary">{msg.coaching.score}/10</span>
            </div>
            <RubricBar score={msg.coaching.score} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              <ul className="flex flex-col gap-1">
                {msg.coaching.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-tertiary flex-shrink-0 mt-0.5">check</span>{s}
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col gap-1">
                {msg.coaching.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-warning flex-shrink-0 mt-0.5">lightbulb</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  // candidate
  return (
    <div className="flex flex-col gap-space-xs items-end">
      <div className="flex items-center gap-space-sm">
        <span className="label-caps text-on-surface-variant uppercase">Candidate</span>
        <div className="w-7 h-7 rounded-lg bg-surface-overlay flex items-center justify-center text-on-surface">
          <span className="material-symbols-outlined text-[16px]">person</span>
        </div>
      </div>
      <div className="card p-space-md max-w-[85%] whitespace-pre-wrap font-body-md text-body-md text-on-surface" style={{ background: "var(--bg-surface-elevated)" }}>
        {msg.content}
      </div>
    </div>
  );
}

function RubricBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <div className="h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
      <div className={`h-full ${pct >= 70 ? "bg-tertiary" : pct >= 40 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="card p-space-md flex items-start gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.5)" }}>
      <span className="material-symbols-outlined text-error">error</span>
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-error">Đã xảy ra lỗi</span>
        <span className="font-body-sm text-body-sm text-on-surface">{message}</span>
      </div>
    </div>
  );
}

function EvaluatingBanner() {
  return (
    <div className="card p-space-md flex items-center gap-space-sm glow-active">
      <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-on-surface">AI đang chấm điểm tổng kết…</span>
        <span className="label-code-sm text-on-surface-variant">Đánh giá 4 tiêu chí · Structured JSON · Auto-repair</span>
      </div>
    </div>
  );
}

function CompletedBanner({ sessionId }: { sessionId: string }) {
  return (
    <a href={`/report/${sessionId}`} className="card p-space-md flex items-center gap-space-sm glow-active">
      <span className="material-symbols-outlined text-tertiary">verified</span>
      <div className="flex flex-col flex-1">
        <span className="font-headline-sm text-headline-sm text-on-surface">Báo cáo đã sẵn sàng</span>
        <span className="label-code-sm text-on-surface-variant">Xem đánh giá tổng kết →</span>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
    </a>
  );
}
