"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useByok } from "@/components/ByokConfigContext";
import { Chip } from "@/components/Chip";
import { DifficultyBadge, difficultyForRound } from "@/components/DifficultyBadge";
import { useStreamingChat } from "@/lib/useStreamingChat";
import { sessionKeyError } from "@/lib/session-key";
import { EVALUATION_STALE_AFTER_MS } from "@/lib/evaluation-constants";
import { renderMarkdown } from "@/lib/markdown";
import { earlyStopOptions, rubricPercent } from "@/lib/scoring";
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
  const [stage, setStage] = useState<"loading" | "ready" | "error" | "evaluating" | "completed" | "failed">("loading");
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [showEarlyStopConfirm, setShowEarlyStopConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [evaluationPending, setEvaluationPending] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  const hydrateSession = (json: { session: SessionRow; turns: MessageTurnRow[] }) => {
    setSession(json.session);
    const answered = json.turns.filter((t) => t.role === "user").length;
    const asked = json.turns.filter((t) => t.role === "assistant").length;
    setPlan({ planned: json.session.planned_rounds, completed: answered, turn: Math.min(asked || 1, json.session.planned_rounds) });
    const ui: UiMessage[] = [];
    for (const t of json.turns) {
      if (t.role === "assistant") {
        ui.push({
          id: `${t.id}`, role: "interviewer", content: t.content,
          difficulty: difficultyForRound(t.turn_number, json.session.planned_rounds),
          coaching: null,
          turnNumber: t.turn_number, ts: t.id,
        });
      } else if (t.role === "user") {
        ui.push({ id: `${t.id}`, role: "candidate", content: t.content, turnNumber: t.turn_number, ts: t.id });
      }
    }
    for (const t of json.turns) {
      if (t.role === "assistant" && t.micro_rubric) {
        try {
          const rubric = JSON.parse(t.micro_rubric);
          const question = ui.find((m) => m.role === "interviewer" && m.turnNumber === t.turn_number);
          if (question) question.coaching = rubric;
        } catch { /* Ignore malformed historical feedback. */ }
      }
    }
    setMessages(ui.sort((a, b) => a.turnNumber - b.turnNumber || (a.role === "interviewer" ? -1 : 1)));
    setShowEarlyStopConfirm(false);
    if (json.session.status === "completed") setStage("completed");
    else if (json.session.status === "evaluating") setStage("evaluating");
    else if (json.session.status === "failed") setStage("failed");
    else setStage("ready");
    setEvaluationPending(false);
    if (json.session.status === "completed") setEvaluationError(null);
  };

  useEffect(() => {
    if (stage !== "evaluating") return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${params.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setSession(data.session);
        if (data.session.status !== "evaluating") hydrateSession(data);
        else setPlan((p) => p ? { ...p, completed: data.turns.filter((t: MessageTurnRow) => t.role === "user").length } : p);
      } catch { /* Keep the current status; the user can reload. */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [stage, params.id]);

  const checkEvaluationStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/sessions/${params.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      hydrateSession(await response.json());
      setEvaluationError(null);
    } catch {
      setEvaluationError("Không kiểm tra được trạng thái phiên. Vui lòng thử lại.");
    } finally {
      setCheckingStatus(false);
    }
  };

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${params.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (alive) hydrateSession(json);
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

  const sendMessage = async (opening: boolean, earlyStop = false, overrideAnswer?: string) => {
    if (inFlightRef.current || !session || stage !== "ready" || finalizing) return;
    const keyError = sessionKeyError(cfg, session);
    if (keyError) { setBootErr(keyError); return; }
    setBootErr(null);
    if (opening ? messages.some((m) => m.role === "interviewer") :
        !messages.some((m) => m.role === "interviewer" && m.turnNumber === (plan?.completed ?? 0) + 1 && !m.streaming)) return;
    const submittedAnswer = opening ? "" : (overrideAnswer ?? answer).trim();
    if (!opening && !submittedAnswer && !earlyStop) return;
    inFlightRef.current = true;

    const candidateUiId = `cand-${Date.now()}`;
    if (submittedAnswer) {
      setMessages((m) => [...m, { id: candidateUiId, role: "candidate", content: submittedAnswer, turnNumber: plan?.turn ?? 1, ts: Date.now() }]);
    }

    const willFinalize = !opening && (earlyStop || (plan?.completed ?? 0) + 1 >= (plan?.planned ?? 8));
    setShowEarlyStopConfirm(false);
    setEvaluationError(null);
    if (willFinalize) {
      setFinalizing(true);
      setEvaluationPending(true);
    }
    const placeholderId = `int-${Date.now()}`;
    if (!willFinalize) {
      const questionTurn = opening ? 1 : (plan?.completed ?? 0) + 2;
      setMessages((m) => [...m, { id: placeholderId, role: "interviewer", content: "", streaming: true,
        difficulty: difficultyForRound(questionTurn, plan?.planned ?? 8), turnNumber: questionTurn, ts: Date.now() }]);
    }

    let accum = "";
    let persisted = false;
    try {
      await submit({
        sessionId: session.id,
        provider: session.provider,
        model: session.model,
        baseUrl: session.base_url ?? undefined,
        apiKey: cfg.apiKey,
        temperature: session.temperature,
        maxTokens: session.max_tokens,
        topP: session.top_p,
        answer: submittedAnswer,
        earlyStop,
      }, {
        onStart: ({ turn, plan: p }) => {
          setPlan({ planned: p.planned, completed: p.completed, turn });
        },
        onDelta: (chunk) => {
          accum += chunk;
          setMessages((m) => m.map((mm) => mm.id === placeholderId ? { ...mm, content: accum } : mm));
        },
        onCoaching: (rubric) => {
          const scoredTurn = (plan?.completed ?? 0) + 1;
          setMessages((m) => m.map((mm) => mm.role === "interviewer" && mm.turnNumber === scoredTurn ? { ...mm, coaching: rubric } : mm));
        },
        onPersisted: ({ userTurn, assistantTurn }) => {
          persisted = true;
          if (willFinalize) {
            setEvaluationPending(false);
            setStage("evaluating");
          }
          setPlan((p) => p ? { ...p, completed: userTurn, turn: Math.min(assistantTurn, p.planned) } : p);
        },
        onDone: ({ reason }) => {
          setMessages((m) => m.map((mm) => mm.id === placeholderId ? { ...mm, streaming: false } : mm));
          if (reason === "complete") {
            setStage("completed");
            router.push(`/report/${params.id}`);
          }
        },
      });
      if (persisted) setAnswer("");
    } catch {
      // Discard unpersisted deltas and reload the durable transcript after errors or cancellation.
      if (willFinalize) {
        setEvaluationPending(false);
        setEvaluationError("Không thể xác nhận kết quả chấm điểm. Hãy kiểm tra trạng thái phiên.");
      }
      try {
        const res = await fetch(`/api/sessions/${params.id}`);
        if (res.ok) {
          const json = await res.json();
          hydrateSession(json);
          if (json.session.status === "completed") setEvaluationError(null);
          if (persisted || json.turns.some((t: MessageTurnRow) => t.role === "user" && t.turn_number === (plan?.completed ?? 0) + 1)) {
            setAnswer("");
          }
        } else {
          setMessages((m) => m.filter((mm) => mm.id !== placeholderId && mm.id !== candidateUiId));
        }
      } catch {
        setMessages((m) => m.filter((mm) => mm.id !== placeholderId && mm.id !== candidateUiId));
        if (willFinalize) setEvaluationError("Không kiểm tra được trạng thái phiên. Vui lòng tải lại trang trước khi gửi tiếp.");
      }
    } finally {
      inFlightRef.current = false;
      setFinalizing(false);
      if (willFinalize) setEvaluationPending(false);
    }
  };

  const cancelAndExit = () => {
    if (!session) return;
    if (confirm("Hủy phiên sẽ xóa phiên mà không tạo báo cáo. Bạn có chắc?")) {
      fetch(`/api/sessions/${session.id}`, { method: "DELETE" }).then(() => router.push("/history"));
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

  const evaluatingStale = stage === "evaluating" &&
    (session.evaluation_started_at == null || Date.now() - session.evaluation_started_at * 1000 > EVALUATION_STALE_AFTER_MS);
  const pct = plan ? Math.round((plan.completed / plan.planned) * 100) : 0;
  const earlyStopMode = earlyStopOptions({
    answeredTurns: plan?.completed ?? 0,
    plannedRounds: plan?.planned ?? 0,
    hasDraftAnswer: answer.trim().length > 0,
    sessionStatus: session.status,
  });

  return (
    <div className="w-full h-[calc(100svh-4rem)] flex flex-col">
      {/* Mobile toolbar (visible only on small screens; mirrors the desktop sidebar header + cancel). */}
      <div
        className="lg:hidden border-b"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        <div className="flex items-center gap-space-sm px-gutter py-space-sm">
          <a
            href="/history"
            aria-label="Về lịch sử"
            className="btn btn-ghost"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <div className="flex items-center gap-space-xs min-w-0 flex-1">
            <Chip tone="indigo">{session.id}</Chip>
            <span className="font-body-sm text-body-sm text-on-surface truncate">
              {session.role}
            </span>
          </div>
          <button
            onClick={cancelAndExit}
            aria-label="Hủy phiên"
            className="btn btn-ghost text-error"
            style={{ borderColor: "rgba(244,63,94,0.5)", color: "var(--destructive)" }}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
            <span className="font-headline-sm text-headline-sm">Hủy phiên</span>
          </button>
        </div>
      </div>

      {/* Body row (desktop: sidebar | section | coaching; mobile: section only). */}
      <div className="flex-1 flex min-h-0">
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
            onClick={cancelAndExit}
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
                {stage === "ready" ? (
                  <button type="button" onClick={() => sendMessage(true)} disabled={streaming || finalizing || inFlightRef.current} className="btn btn-primary mt-space-md">
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span> Bắt đầu
                  </button>
                ) : null}
              </div>
            ) : null}
            {messages.map((m) => <Bubble key={m.id} msg={m} />)}
            {bootErr && stage === "ready" ? <ErrorBanner message={bootErr} /> : null}
            {error && stage === "ready" && !finalizing ? <ErrorBanner message={error.message} /> : null}
            {evaluationError && stage === "evaluating" && !evaluationPending && !evaluatingStale ? <ErrorBanner message={evaluationError} /> : null}
            {evaluationPending ? <EvaluatingBanner pending /> : null}
            {stage === "evaluating" && !evaluatingStale && !evaluationPending ? <EvaluatingBanner /> : null}
            {(stage === "evaluating" && evaluatingStale || stage === "failed") && !evaluationPending ? (
              <div className="card p-space-md flex flex-col gap-space-sm" role="status" aria-live="polite" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                <span className="font-headline-sm text-headline-sm text-error">Chấm điểm chưa hoàn tất</span>
                <span className="font-body-sm text-body-sm text-on-surface">Câu trả lời đã lưu. Bạn có thể thử chấm điểm lại mà không cần gửi lại câu trả lời.</span>
                <div className="flex gap-space-sm">
                  <a className="btn btn-primary" href={`/report/${params.id}`}>Thử chấm điểm lại</a>
                  <button className="btn btn-ghost" onClick={checkEvaluationStatus} disabled={checkingStatus}>Kiểm tra trạng thái</button>
                </div>
              </div>
            ) : null}
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
              {plan && stage === "ready" && !finalizing && earlyStopMode !== "disabled" ? (
                <button onClick={() => setShowEarlyStopConfirm((v) => !v)} disabled={streaming} className="btn btn-ghost text-error" style={{ borderColor: "rgba(244,63,94,0.5)", color: "var(--destructive)" }}>
                  <span className="material-symbols-outlined text-[18px]">stop_circle</span> Dừng sớm & chấm điểm
                </button>
              ) : null}
            </div>
            <textarea
              className="input min-h-[120px] resize-y"
              placeholder="Trả lời câu hỏi phỏng vấn… (tối đa 4.000 ký tự)"
              aria-label="Câu trả lời phỏng vấn"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, MAX_ANSWER))}
              disabled={streaming || finalizing || stage !== "ready" ||
                !messages.some((m) => m.role === "interviewer" && m.turnNumber === (plan?.completed ?? 0) + 1 && !m.streaming)}
              maxLength={MAX_ANSWER}
            />
            {showEarlyStopConfirm && stage === "ready" && !streaming && !finalizing ? (
              earlyStopMode === "cancel-only" ? (
                <div className="card p-space-sm flex flex-col gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                  <span className="font-body-sm text-body-sm text-error">
                    Bạn chưa có câu trả lời nào — hủy phiên sẽ xóa phiên mà không tạo báo cáo.
                  </span>
                  <div className="flex justify-end gap-space-sm">
                    <button onClick={() => setShowEarlyStopConfirm(false)} className="btn btn-ghost">Hủy bỏ</button>
                    <button onClick={cancelAndExit} disabled={streaming} className="btn btn-destructive">Hủy phiên</button>
                  </div>
                </div>
              ) : earlyStopMode === "evaluate-empty" ? (
                <div className="card p-space-sm flex items-center justify-between" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                  <span className="font-body-sm text-body-sm text-error">
                    Dừng sớm sẽ tạo báo cáo ngay với số câu đã trả lời. Bạn có chắc?
                  </span>
                  <div className="flex gap-space-sm">
                    <button onClick={() => setShowEarlyStopConfirm(false)} className="btn btn-ghost">Hủy</button>
                    <button onClick={() => sendMessage(false, true)} disabled={streaming} className="btn btn-destructive">Dừng & chấm điểm</button>
                  </div>
                </div>
              ) : earlyStopMode === "evaluate-or-finalize-draft" ? (
                <div className="card p-space-sm flex flex-col gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                  <span className="font-body-sm text-body-sm text-error">
                    Bạn đang soạn câu trả lời: muốn chấm với các câu đã lưu (bỏ qua bản nháp), hay gửi bản nháp làm câu cuối?
                  </span>
                  <div className="flex flex-wrap justify-end gap-space-sm">
                    <button onClick={() => setShowEarlyStopConfirm(false)} className="btn btn-ghost">Hủy bỏ</button>
                    <button onClick={() => sendMessage(false, true, "")} disabled={streaming} className="btn btn-destructive">Dừng & chấm các câu đã trả lời</button>
                    <button onClick={() => sendMessage(false, true)} disabled={streaming} className="btn btn-primary">Gửi bản nháp rồi chấm</button>
                  </div>
                </div>
              ) : null
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm label-code-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
                <span>API Key không bao giờ chạm vào SQLite / log</span>
              </div>
              <div className="flex gap-space-sm">
                {streaming && !finalizing ? (
                  <button onClick={stop} className="btn btn-ghost" aria-label="Dừng stream từ AI">
                    <span className="material-symbols-outlined text-[18px]">stop</span> Dừng stream
                  </button>
                ) : null}
                <button
                  onClick={() => sendMessage(false)}
                  disabled={streaming || finalizing || !answer.trim() || stage !== "ready" ||
                    !messages.some((m) => m.role === "interviewer" && m.turnNumber === (plan?.completed ?? 0) + 1 && !m.streaming)}
                  className="btn btn-primary"
                  aria-label="Gửi câu trả lời"
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
              Mỗi câu trả lời (trừ câu cuối) hiện chấm 0-100 ở đây; câu cuối được chấm trong báo cáo tổng kết.
            </p>
            <div className="flex flex-col gap-space-sm">
              {messages.filter((m) => m.role === "interviewer" && m.coaching).slice().reverse().map((m) => (
                <div key={m.id} className="card p-space-md flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-on-surface uppercase">Câu {m.turnNumber}</span>
                    <span className="label-code-sm text-tertiary">{m.coaching!.score}/100</span>
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
              <span className="label-code-sm text-tertiary">{msg.coaching.score}/100</span>
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
  const pct = rubricPercent(score);
  return (
    <div className="h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
      <div className={`h-full ${pct >= 70 ? "bg-tertiary" : pct >= 40 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="card p-space-md flex items-start gap-space-sm" role="alert" style={{ borderColor: "rgba(244,63,94,0.5)" }}>
      <span className="material-symbols-outlined text-error">error</span>
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-error">Đã xảy ra lỗi</span>
        <span className="font-body-sm text-body-sm text-on-surface">{message}</span>
      </div>
    </div>
  );
}

function EvaluatingBanner({ pending = false }: { pending?: boolean }) {
  return (
    <div className="card p-space-md flex items-center gap-space-sm glow-active" role="status" aria-live="polite">
      <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-on-surface">{pending ? "Đang lưu câu trả lời để chấm điểm…" : "AI đang chấm điểm tổng kết…"}</span>
        <span className="label-code-sm text-on-surface-variant">{pending ? "Đừng gửi lại câu trả lời; kết quả sẽ được đồng bộ." : "Đánh giá 4 tiêu chí · Vui lòng chờ báo cáo."}</span>
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
