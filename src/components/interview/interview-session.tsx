"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Phiên phỏng vấn (S11 — `/interview/session`).
 *
 * ⚠️ FR-MI-05 — mỗi lượt hiện điểm **chi tiết theo rubric**, không chỉ tổng.
 * ⚠️ FR-MI-06 — Adaptive Loop: AI sinh câu tiếp theo dựa trên câu trả lời.
 * ⚠️ FR-MI-11 — không có key ⇒ nói rõ, KHÔNG giả lập chấm điểm.
 */

export interface TurnDTO {
  id: string;
  index: number;
  question: string;
  kind: string;
  skillId: string | null;
  skillName: string | null;
  answer: string | null;
  scores: unknown;
  behavioralScores: unknown;
  total: number | null;
  feedback: string | null;
  createdAt: string;
}

export interface InterviewSessionDTO {
  id: string;
  plannedCount: number;
  askedCount: number;
  status: string;
  totalScore: number | null;
  sessionType: string;
  focusHint: string | null;
  profile: { label: string; jobTitle: string; seniority: string };
  turns: TurnDTO[];
}

export interface InterviewSessionProps {
  session: InterviewSessionDTO;
  aiEnabled: boolean;
}

const CRITERION_LABELS: Record<string, string> = {
  accuracy: "Độ chính xác",
  depth: "Chiều sâu",
  reasoning: "Lập luận",
  communication: "Truyền đạt",
  tradeoff: "Đánh đổi",
  specific: "Cụ thể",
  star: "Cấu trúc STAR",
  selfaware: "Tự nhận thức",
  outcome: "Kết quả",
};

export function InterviewSession({ session, aiEnabled }: InterviewSessionProps) {
  const router = useRouter();

  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    scores: Record<string, { score: number; note: string }>;
    behavioralScores: Record<string, { score: number; note: string }> | null;
    total: number;
    feedback: string;
    sessionDone: boolean;
  } | null>(null);

  const currentTurn = session.turns[session.turns.length - 1] ?? null;
  const done = session.status !== "active";

  async function submit() {
    if (!currentTurn || answer.trim().length === 0 || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          index: currentTurn.index,
          answer: answer.trim(),
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không gửi được câu trả lời");
        return;
      }

      setFeedback(payload.data);
      setAnswer("");
      router.refresh();
    } catch {
      setError("Không kết nối được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {session.profile.label}
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {session.profile.jobTitle} · {session.profile.seniority} · lượt{" "}
          {session.turns.length}/{session.plannedCount}
        </p>
      </header>

      {/* Thanh tiến độ */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuenow={session.turns.length}
        aria-valuemin={0}
        aria-valuemax={session.plannedCount}
        aria-label="Tiến độ phiên phỏng vấn"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${(session.turns.length / Math.max(1, session.plannedCount)) * 100}%`,
          }}
        />
      </div>

      {session.focusHint && (
        <p className="font-label-sm text-label-sm text-outline">
          {session.focusHint}
        </p>
      )}

      {/* ⚠️ FR-MI-11 */}
      {!aiEnabled && (
        <p className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
          <Icon name="lock" size={12} />
          Chưa có API key — chấm điểm cần API key
        </p>
      )}

      {/* Lịch sử lượt */}
      <ul className="space-y-space-sm">
        {session.turns.map((turn) => (
          <li key={turn.id} className="rounded-xl bg-surface-container p-space-md">
            <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Câu {turn.index + 1} · {turn.kind}
              </span>
              {turn.total !== null && (
                <span className="font-headline-sm text-headline-sm text-primary tabular">
                  {turn.total.toFixed(1)}
                </span>
              )}
            </div>

            <p className="mt-space-xs text-body-md text-body-md text-on-surface">
              {turn.question}
            </p>

            {turn.answer && (
              <p className="mt-space-sm border-l-2 border-outline-variant pl-space-sm text-body-sm text-body-sm text-on-surface-variant">
                {turn.answer}
              </p>
            )}

            {turn.feedback && (
              <p className="mt-space-sm font-body-sm text-body-sm text-on-surface">
                {turn.feedback}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* Phản hồi lượt vừa trả lời (FR-MI-05) */}
      {feedback && (
        <section className="rounded-xl bg-surface-container-low p-space-lg" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface">
              Điểm lượt này
            </h2>
            <span className="font-headline-lg text-headline-lg text-primary tabular">
              {feedback.total.toFixed(1)}
              <span className="font-label-sm text-label-sm text-outline"> / 5</span>
            </span>
          </div>

          <p className="mt-space-sm text-body-md text-body-md text-on-surface">
            {feedback.feedback}
          </p>

          {/* Điểm chi tiết từng tiêu chí */}
          <ul className="mt-space-md space-y-space-xs">
            {Object.entries(feedback.scores).map(([key, value]) => (
              <li key={key} className="flex items-center gap-space-sm">
                <span className="w-28 shrink-0 font-body-sm text-body-sm text-on-surface-variant">
                  {CRITERION_LABELS[key] ?? key}
                </span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(value.score / 5) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-code-md text-code-md text-on-surface tabular">
                  {value.score.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>

          {feedback.behavioralScores && (
            <>
              <p className="mt-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Rubric hành vi
              </p>
              <ul className="mt-space-xs space-y-space-xs">
                {Object.entries(feedback.behavioralScores).map(([key, value]) => (
                  <li
                    key={key}
                    className="flex items-baseline justify-between gap-space-sm"
                  >
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {CRITERION_LABELS[key] ?? key}
                    </span>
                    <span className="font-code-md text-code-md text-on-surface tabular">
                      {value.score.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Ô trả lời */}
      {!done && currentTurn && (
        <div>
          <label
            htmlFor="interview-answer"
            className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
          >
            Câu trả lời của bạn
          </label>
          <textarea
            id="interview-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Trả lời như bạn sẽ trả lời trong phỏng vấn thật…"
            rows={8}
            className="mt-space-xs w-full resize-y rounded-xl bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || answer.trim().length === 0 || !aiEnabled}
            className={cn(
              "mt-space-sm inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <Icon name="send" size={16} />
            {busy ? "Đang chấm…" : "Gửi câu trả lời"}
          </button>
        </div>
      )}

      {done && (
        <div className="rounded-xl bg-surface-container p-space-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Phiên đã kết thúc
          </h2>
          <p className="mt-space-sm font-headline-lg text-headline-lg text-primary tabular">
            {session.totalScore !== null ? session.totalScore.toFixed(1) : "—"}
            <span className="font-label-sm text-label-sm text-outline"> / 5</span>
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
