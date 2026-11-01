"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Luyện nói / Luyện viết (S10 + S11) — AC-CM-1..6, AC-CM-9..11.
 *
 * ⚠️ AC-CM-1 — rubric **đúng 5 tiêu chí**.
 * ⚠️ AC-CM-2 — tổng điểm do server tính (trung bình 5 tiêu chí).
 * ⚠️ AC-CM-3 — delta so với lần trước.
 * ⚠️ AC-CM-11 — không có key ⇒ nói rõ là chấm cục bộ, **không** ghi "AI".
 */

export interface SpeakPromptDTO {
  id: string;
  title: string;
  prompt: string;
  lang: string | null;
  level: string | null;
  mode: string | null;
  minutes: number;
  isUserMade: boolean;
}

export interface RubricResult {
  score: number;
  rubric: Record<string, number>;
  feedback: string;
  errorGroups: {
    grammar: string[];
    vocab: string[];
    expression: string[];
    context: string[];
  };
  corrections: string[];
  keywords: Array<{ front: string; back: string }>;
  source: "ai" | "local";
}

export interface PracticeWriterProps {
  prompts: SpeakPromptDTO[];
  /** Có API key không (false ⇒ chấm cục bộ, nói rõ). */
  aiEnabled: boolean;
  initialPromptId?: string;
}

const CRITERIA_LABELS: Record<string, string> = {
  clarity: "Rõ ràng",
  structure: "Cấu trúc",
  tone: "Giọng văn",
  naturalness: "Tự nhiên",
  grammar: "Ngữ pháp",
};

const ERROR_GROUP_LABELS: Record<string, string> = {
  grammar: "Ngữ pháp",
  vocab: "Từ vựng",
  expression: "Cách diễn đạt",
  context: "Ngữ cảnh",
};

export function PracticeWriter({
  prompts,
  aiEnabled,
  initialPromptId,
}: PracticeWriterProps) {
  const router = useRouter();

  const [promptId, setPromptId] = useState<string | null>(
    initialPromptId ?? prompts[0]?.id ?? null,
  );
  const [text, setText] = useState("");
  const [result, setResult] = useState<RubricResult | null>(null);
  const [delta, setDelta] = useState<{ delta: number; previous: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompt = prompts.find((p) => p.id === promptId) ?? null;

  async function grade() {
    if (text.trim().length === 0) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setDelta(null);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: prompt?.lang ?? "en",
          mode: prompt?.mode === "speak" ? "speak" : "write",
          prompt: prompt?.prompt,
          // ⚠️ AC-CM-11 — không có key thì cho phép fallback cục bộ.
          allowLocalFallback: true,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không chấm được");
        return;
      }

      setResult(payload.data as RubricResult);

      // Lưu lượt luyện (AC-CM-5 — tạo Evidence).
      const commit = await fetch("/api/speak/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId,
          text,
          lang: prompt?.lang ?? "en",
          mode: prompt?.mode === "speak" ? "speak" : "write",
          score: payload.data.score,
          rubric: payload.data.rubric,
          feedback: payload.data.feedback,
        }),
      });

      const commitPayload = await commit.json();
      if (commitPayload.ok && commitPayload.data.delta) {
        // ⚠️ AC-CM-3 — delta so với lần trước.
        setDelta(commitPayload.data.delta);
      }

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
          Luyện nói &amp; viết
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {prompts.length} bài trong kho · chấm theo 5 tiêu chí
        </p>
      </header>

      {/* Chọn đề */}
      <div>
        <label
          htmlFor="practice-prompt"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Đề bài
        </label>
        <select
          id="practice-prompt"
          value={promptId ?? ""}
          onChange={(event) => {
            setPromptId(event.target.value || null);
            setResult(null);
            setDelta(null);
          }}
          className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">— Tự do —</option>
          {prompts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.level ? ` (${item.level})` : ""}
              {item.isUserMade ? " · của tôi" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Đề */}
      {prompt && (
        <div className="rounded-xl bg-surface-container p-space-lg">
          <p className="font-body-md text-body-md text-on-surface">
            {prompt.prompt}
          </p>
        </div>
      )}

      {/* Ô viết */}
      <div>
        <label
          htmlFor="practice-text"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Bài của bạn
        </label>
        <textarea
          id="practice-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Viết hoặc dán lời nói của bạn…"
          rows={10}
          className="mt-space-xs w-full resize-y rounded-xl bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className="font-code-md text-code-md text-outline tabular">
          {text.trim().split(/\s+/).filter(Boolean).length} từ
        </span>
      </div>

      <button
        type="button"
        onClick={() => void grade()}
        disabled={busy || text.trim().length === 0}
        className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="check" size={16} />
        {busy ? "Đang chấm…" : "Chấm điểm"}
      </button>

      {/* ⚠️ AC-CM-11 — nói rõ chế độ chấm */}
      {!aiEnabled && (
        <p className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
          <Icon name="lock" size={12} />
          Chưa có API key — chấm bằng rule cục bộ, không phải AI
        </p>
      )}

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}

      {/* Kết quả — AC-CM-1, AC-CM-2 */}
      {result && (
        <section className="space-y-gutter-md" aria-live="polite">
          <div className="rounded-xl bg-surface-container p-space-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Điểm
              </h2>
              <div className="flex items-baseline gap-space-sm">
                <span className="font-headline-lg text-headline-lg text-primary tabular">
                  {result.score}
                </span>
                <span className="font-label-sm text-label-sm text-outline">/ 5</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-label-sm text-label-sm",
                    result.source === "ai"
                      ? "bg-secondary-container text-secondary"
                      : "bg-outline/15 text-outline",
                  )}
                >
                  {result.source === "ai" ? "AI" : "Rule cục bộ"}
                </span>
              </div>
            </div>

            {/* ⚠️ AC-CM-3 — delta so với lần trước */}
            {delta && (
              <p className="mt-space-sm font-label-sm text-label-sm text-primary tabular">
                {delta.delta >= 0 ? "+" : ""}
                {delta.delta} so với lần trước ({delta.previous})
              </p>
            )}

            {/* 5 tiêu chí */}
            <ul className="mt-space-md space-y-space-xs">
              {Object.entries(result.rubric).map(([key, value]) => (
                <li key={key} className="flex items-center gap-space-sm">
                  <span className="w-32 shrink-0 font-body-sm text-body-sm text-on-surface-variant">
                    {CRITERIA_LABELS[key] ?? key}
                  </span>
                  <span
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(Number(value) / 5) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right font-code-md text-code-md text-on-surface tabular">
                    {Number(value).toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-space-md text-body-md text-body-md text-on-surface">
              {result.feedback}
            </p>
          </div>

          {/* 4 nhóm lỗi (AC-CM-9) */}
          {Object.values(result.errorGroups).some((group) => group.length > 0) && (
            <div className="rounded-xl bg-surface-container-low p-space-lg">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Lỗi cần sửa
              </h3>

              <div className="mt-space-md grid grid-cols-1 gap-space-md sm:grid-cols-2">
                {Object.entries(result.errorGroups).map(([key, items]) =>
                  items.length === 0 ? null : (
                    <div key={key}>
                      <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                        {ERROR_GROUP_LABELS[key] ?? key}
                      </p>
                      <ul className="mt-space-xs space-y-space-xs">
                        {items.map((item, index) => (
                          <li
                            key={index}
                            className="text-body-sm text-body-sm text-on-surface-variant"
                          >
                            • {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Gợi ý sửa */}
          {result.corrections.length > 0 && (
            <div className="rounded-xl bg-surface-container-low p-space-lg">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Gợi ý sửa
              </h3>
              <ul className="mt-space-md space-y-space-xs">
                {result.corrections.map((item, index) => (
                  <li
                    key={index}
                    className="text-body-sm text-body-sm text-on-surface-variant"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
