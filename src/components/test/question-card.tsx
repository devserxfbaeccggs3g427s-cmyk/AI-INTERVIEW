"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { Lang, ScoredItem } from "@/lib/test";

export interface QuestionCardProps {
  item: ScoredItem;
  index: number;
  lang: Lang;
  value: string | null;
  flagged: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggleFlag: () => void;
}

/**
 * Render 1 câu theo `itemType` (FR-LT-02).
 *
 * ⚠️ NFR-LT-04: option dạng `role="radio"` + `aria-checked`; nút nghe có
 * `aria-label`; phím tắt có `aria-keyshortcuts`.
 * ⚠️ R5: trình duyệt không có giọng `zh-CN` ⇒ hiện hướng dẫn dùng pinyin.
 */
export function QuestionCard({
  item,
  index,
  lang,
  value,
  flagged,
  disabled,
  onChange,
  onToggleFlag,
}: QuestionCardProps) {
  const [speakUnavailable, setSpeakUnavailable] = useState(false);

  const ttsLang = lang === "zh" ? "zh-CN" : "en-US";
  const canSpeak = item.audioText !== null || item.itemType === "mc_vocab" || item.itemType === "cloze";

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeakUnavailable(true);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;
    const matched = voices.some((voice) => voice.lang.toLowerCase().startsWith(ttsLang.slice(0, 2)));
    setSpeakUnavailable(!matched);
  }, [ttsLang]);

  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeakUnavailable(true);
      return;
    }
    const text = item.audioText ?? item.prompt.replace(/___/g, "blank");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ttsLang;
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const options = item.options ?? [];
  const isChoice = item.itemType === "mc_vocab" || item.itemType === "mc_grammar" || item.itemType === "listening";

  return (
    <article className="space-y-space-md">
      {/* ── Chip câu + chip dạng + nút nghe ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className="rounded bg-secondary-container/40 px-2 py-1 font-label-md text-label-md font-semibold text-secondary">
          Câu {String(index + 1).padStart(2, "0")}
        </span>
        <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
          {item.itemType}
        </span>

        {canSpeak && (
          <button
            type="button"
            onClick={speak}
            aria-label={`Nghe phát âm (${ttsLang})`}
            aria-keyshortcuts="Space"
            className="rounded-lg bg-surface-container-high px-3 py-1 font-label-md text-label-md text-primary transition hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="volume_up" size={16} /> Nghe phát âm ({ttsLang})
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          aria-label={`Đánh dấu cờ câu ${index + 1}`}
          aria-keyshortcuts="F"
          className={cn(
            "rounded-lg px-3 py-1 font-label-md text-label-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            flagged
              ? "bg-tertiary-container/20 text-tertiary"
              : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
          )}
        >
          <Icon name="flag" size={16} /> {flagged ? "Đã gắn cờ" : "Bỏ qua / đánh dấu"}
        </button>
      </div>

      {speakUnavailable && (
        <p className="font-body-sm text-body-sm text-tertiary">
          Giọng {ttsLang} không khả dụng — dùng pinyin + hán tự.
        </p>
      )}

      {/* ── Khối prompt ───────────────────────────────────────────────── */}
      <div className="bg-surface-container p-space-lg rounded-xl">
        <p className="font-headline-md text-headline-md text-on-surface">
          {renderPrompt(item.prompt)}
        </p>
        {item.audioText && item.itemType === "listening" && (
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Đoạn nghe: {item.audioText}
          </p>
        )}
        {item.skillName && (
          <p className="mt-space-sm font-label-sm text-label-sm text-outline">
            Kỹ năng: {item.skillName}
          </p>
        )}
      </div>

      {/* ── Điều khiển trả lời ─────────────────────────────────────────── */}
      {isChoice ? (
        <div role="radiogroup" aria-label={`Câu ${index + 1}`} className="space-y-space-sm">
          {options.map((option, optionIndex) => {
            const selected = value === option;
            return (
              <button
                key={`${option}-${optionIndex}`}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-keyshortcuts={String(optionIndex + 1)}
                disabled={disabled}
                onClick={() => onChange(option)}
                className={cn(
                  "flex w-full items-center gap-space-md rounded-lg p-space-md text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                  selected
                    ? "bg-surface-container-high"
                    : "bg-surface-container hover:bg-surface-container-high",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded font-label-md text-label-md",
                    selected
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-highest text-on-surface-variant",
                  )}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="font-body-md text-body-md text-on-surface">{option}</span>
                {selected && (
                  <Icon name="check_circle" size={18} className="ml-auto text-primary" />
                )}
              </button>
            );
          })}
        </div>
      ) : item.itemType === "cloze" ? (
        <div className="space-y-space-sm">
          <label
            htmlFor={`answer-${index}`}
            className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
          >
            Điền từ vào chỗ trống
          </label>
          <input
            id={`answer-${index}`}
            type="text"
            value={value ?? ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            aria-label={item.prompt}
            className="w-full rounded-lg bg-surface-container-lowest p-space-md font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      ) : (
        <div className="space-y-space-sm">
          <label
            htmlFor={`answer-${index}`}
            className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
          >
            {item.itemType === "translation" ? "Bản dịch của bạn" : "Bài làm của bạn"}
          </label>
          <textarea
            id={`answer-${index}`}
            value={value ?? ""}
            disabled={disabled}
            rows={6}
            onChange={(event) => onChange(event.target.value)}
            aria-label={item.prompt}
            aria-live="polite"
            className="w-full rounded-lg bg-surface-container-lowest p-space-md font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}
    </article>
  );
}

/** Render chỗ trống `___` bằng nền recessed (design-system §7). */
function renderPrompt(prompt: string) {
  const parts = prompt.split("___");
  if (parts.length === 1) return prompt;

  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 && (
        <span className="bg-surface-container-lowest text-primary font-code-md underline decoration-dashed underline-offset-8">
          &nbsp;?&nbsp;
        </span>
      )}
    </span>
  ));
}
