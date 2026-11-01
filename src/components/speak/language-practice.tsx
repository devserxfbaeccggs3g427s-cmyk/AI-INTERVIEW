"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Luyện ngoại ngữ (S11) — bài viết + hội thoại role-play.
 *
 * ⚠️ AC-CM-7 — tình huống có **mục tiêu ẩn**; mục tiêu chỉ hiện **sau khi
 * chấm**, không lộ trong lúc hội thoại.
 * ⚠️ AC-CM-8 — AI trả lời đúng ngôn ngữ của đề.
 * ⚠️ AC-CM-11 — không có key ⇒ nói rõ, KHÔNG giả lập hội thoại.
 */

export interface PracticePromptDTO {
  id: string;
  title: string;
  prompt: string;
  lang: string | null;
  level: string | null;
  mode: string | null;
  minutes: number;
  isUserMade: boolean;
}

export interface ScenarioDTO {
  id: string;
  title: string;
  brief: string;
  hiddenGoal: string;
  lang: string | null;
  level: string | null;
  durationSec: number;
}

export interface LanguagePracticeProps {
  prompts: PracticePromptDTO[];
  scenarios: ScenarioDTO[];
  aiEnabled: boolean;
}

type Turn = { role: "ai" | "user"; text: string };

export function LanguagePractice({
  prompts,
  scenarios,
  aiEnabled,
}: LanguagePracticeProps) {
  const [mode, setMode] = useState<"write" | "roleplay">("write");

  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Luyện ngoại ngữ
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {prompts.length} bài · {scenarios.length} tình huống hội thoại
        </p>
      </header>

      <div className="flex gap-1" role="group" aria-label="Chế độ luyện">
        {(
          [
            { value: "write" as const, label: "Viết" },
            { value: "roleplay" as const, label: "Hội thoại" },
          ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              "rounded-lg px-4 py-2 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === option.value
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "write" ? (
        <WritePanel prompts={prompts} aiEnabled={aiEnabled} />
      ) : (
        <RoleplayPanel scenarios={scenarios} aiEnabled={aiEnabled} />
      )}
    </div>
  );
}

function WritePanel({
  prompts,
  aiEnabled,
}: {
  prompts: PracticePromptDTO[];
  aiEnabled: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-container p-space-lg">
      <p className="font-body-md text-body-md text-on-surface">
        Chọn đề ở tab <strong>Luyện nói &amp; viết</strong> để viết và được
        chấm theo 5 tiêu chí.
      </p>
      <ul className="mt-space-md space-y-space-xs">
        {prompts.slice(0, 6).map((prompt) => (
          <li
            key={prompt.id}
            className="flex items-baseline justify-between gap-space-sm"
          >
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {prompt.title}
            </span>
            <span className="font-code-md text-code-md text-outline">
              {prompt.lang ?? "—"}
            </span>
          </li>
        ))}
      </ul>

      {!aiEnabled && (
        <p className="mt-space-md inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
          <Icon name="lock" size={12} />
          Chưa có API key — chấm bằng rule cục bộ
        </p>
      )}
    </div>
  );
}

function RoleplayPanel({
  scenarios,
  aiEnabled,
}: {
  scenarios: ScenarioDTO[];
  aiEnabled: boolean;
}) {
  const [scenarioId, setScenarioId] = useState<string | null>(
    scenarios[0]?.id ?? null,
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [userText, setUserText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<{
    goalScore: number;
    evidence: string[];
    feedback: string;
    achieved: boolean;
  } | null>(null);

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;

  async function sendTurn() {
    if (!scenario || userText.trim().length === 0 || busy) return;

    setBusy(true);
    setError(null);

    const nextTurns: Turn[] = [...turns, { role: "user", text: userText.trim() }];

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          action: "turn",
          history: turns,
          userText: userText.trim(),
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không gửi được lượt thoại");
        return;
      }

      setTurns([...nextTurns, { role: "ai", text: payload.data.reply }]);
      setUserText("");
    } catch {
      setError("Không kết nối được");
    } finally {
      setBusy(false);
    }
  }

  async function evaluate() {
    if (!scenario || turns.length === 0 || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          action: "evaluate",
          history: turns,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không chấm được mục tiêu");
        return;
      }

      // ⚠️ AC-CM-7 — mục tiêu ẩn chỉ hiện ở đây, sau khi chấm.
      setEvaluation(payload.data);
    } catch {
      setError("Không kết nối được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-gutter-md">
      {/* Chọn tình huống */}
      <div>
        <label
          htmlFor="scenario"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Tình huống
        </label>
        <select
          id="scenario"
          value={scenarioId ?? ""}
          onChange={(event) => {
            setScenarioId(event.target.value || null);
            setTurns([]);
            setEvaluation(null);
          }}
          className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {scenarios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.lang ?? "en"})
            </option>
          ))}
        </select>
      </div>

      {scenario && (
        <div className="rounded-xl bg-surface-container p-space-lg">
          <p className="font-body-md text-body-md text-on-surface">
            {scenario.brief}
          </p>
        </div>
      )}

      {/* ⚠️ AC-CM-11 — không có key thì nói rõ, không giả lập hội thoại */}
      {!aiEnabled && (
        <p className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
          <Icon name="lock" size={12} />
          Chưa có API key — hội thoại AI cần API key
        </p>
      )}

      {/* Lượt thoại */}
      {turns.length > 0 && (
        <ul className="space-y-space-sm">
          {turns.map((turn, index) => (
            <li
              key={index}
              className={cn(
                "rounded-xl p-space-md",
                turn.role === "ai"
                  ? "bg-surface-container"
                  : "bg-secondary-container",
              )}
            >
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                {turn.role === "ai" ? "Đối tác" : "Bạn"}
              </p>
              <p className="mt-space-xs text-body-md text-body-md text-on-surface">
                {turn.text}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Ô trả lời */}
      <div>
        <label
          htmlFor="roleplay-input"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Trả lời
        </label>
        <textarea
          id="roleplay-input"
          value={userText}
          onChange={(event) => setUserText(event.target.value)}
          placeholder="Nói gì đó…"
          rows={4}
          className="mt-space-xs w-full resize-y rounded-xl bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <div className="flex flex-wrap gap-space-sm">
        <button
          type="button"
          onClick={() => void sendTurn()}
          disabled={busy || userText.trim().length === 0 || !aiEnabled}
          className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {busy ? "Đang chờ…" : "Gửi"}
        </button>

        <button
          type="button"
          onClick={() => void evaluate()}
          disabled={busy || turns.length === 0 || !aiEnabled}
          className="rounded-lg bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Chấm mục tiêu
        </button>
      </div>

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}

      {/* Kết quả chấm mục tiêu ẩn (AC-CM-7) */}
      {evaluation && (
        <section className="rounded-xl bg-surface-container-low p-space-lg" aria-live="polite">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Mức độ đạt mục tiêu
          </h2>

          <p className="mt-space-sm font-headline-lg text-headline-lg text-primary tabular">
            {evaluation.goalScore}
            <span className="font-label-sm text-label-sm text-outline"> / 5</span>
          </p>

          <p className="mt-space-sm text-body-md text-body-md text-on-surface">
            {evaluation.feedback}
          </p>

          {evaluation.evidence.length > 0 && (
            <>
              <p className="mt-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Bằng chứng
              </p>
              <ul className="mt-space-xs space-y-space-xs">
                {evaluation.evidence.map((item, index) => (
                  <li
                    key={index}
                    className="border-l-2 border-primary pl-space-sm text-body-sm text-body-sm text-on-surface-variant"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ⚠️ Mục tiêu ẩn chỉ hiện ở bước chấm. */}
          {scenario && (
            <p className="mt-space-md font-label-sm text-label-sm text-outline">
              Mục tiêu: {scenario.hiddenGoal}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
