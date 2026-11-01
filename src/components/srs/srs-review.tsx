"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { SrsCardDTO, SrsLang, SrsProgressDTO } from "@/lib/srs-types";

/**
 * Phiên ôn thẻ (S09) — AC-LG-1..10.
 *
 * ⚠️ AC-LG-1 — mọi lượt ôn đi qua API `/api/srs/grade` (FSRS thật).
 * ⚠️ AC-LG-8 — TTS có fallback khi thiếu giọng `zh-CN`.
 * ⚠️ AC-LG-9 — đóng giữa chừng không mất dữ liệu (đã lưu mỗi lượt).
 * ⚠️ AC-LG-10 — đổi ngôn ngữ không trộn thẻ (queue theo lang).
 */

export interface SrsReviewProps {
  lang: SrsLang;
  cards: SrsCardDTO[];
  dueCount: number;
  newCount: number;
  progress: SrsProgressDTO;
}

type Grade = 1 | 2 | 3 | 4;

const GRADE_LABELS: Record<Grade, string> = {
  1: "Quên",
  2: "Khó",
  3: "Nhớ",
  4: "Dễ",
};

export function SrsReview({
  lang,
  cards,
  dueCount,
  newCount,
  progress,
}: SrsReviewProps) {
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHanzi, setShowHanzi] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastInterval, setLastInterval] = useState<string | null>(null);
  const [gradedCount, setGradedCount] = useState(0);

  const card = cards[index];
  const finished = index >= cards.length;

  async function speak(text: string, voiceHint?: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voiceHint ?? (lang === "zh" ? "zh-CN" : "en-US");

      // ⚠️ AC-LG-8 — nếu không có giọng `zh-CN` ⇒ fallback sang `zh` rồi `en`.
      const voices = window.speechSynthesis.getVoices();
      const exact = voices.find((v) => v.lang.replace("_", "-") === utterance.lang);
      const fallback =
        exact ??
        voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2))) ??
        voices.find((v) => v.lang.startsWith("en"));

      if (fallback) utterance.voice = fallback;

      window.speechSynthesis.speak(utterance);
    } catch {
      // TTS lỗi ⇒ bỏ qua, không chặn phiên ôn.
    }
  }

  async function grade(rating: Grade) {
    if (!card || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/srs/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, rating }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được lượt ôn");
        return;
      }

      // ⚠️ AC-LG-9 — lượt ôn đã lưu server-side ⇒ đóng tab không mất.
      setLastInterval(payload.data.intervalLabel);
      setGradedCount((n) => n + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
      router.refresh();
    } catch {
      setError("Không kết nối được — lượt ôn chưa được lưu");
    } finally {
      setBusy(false);
    }
  }

  /* ══ Hết thẻ ═══════════════════════════════════════════════════════════ */
  if (finished) {
    return (
      <div className="space-y-gutter-md">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Xong phiên ôn
        </h1>

        <div className="rounded-xl bg-surface-container p-space-lg">
          <p className="font-headline-md text-headline-md text-on-surface tabular">
            {gradedCount} thẻ đã ôn
          </p>
          <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
            {dueCount} thẻ đến hạn · {newCount} thẻ mới
          </p>
        </div>

        {/* Tiến độ — P3: bằng chứng cụ thể, không % mơ hồ */}
        <div className="rounded-xl bg-surface-container-low p-space-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Tiến độ {lang === "zh" ? "tiếng Trung" : "tiếng Anh"}
          </h2>

          <ul className="mt-space-md space-y-space-sm">
            <ProgressRow label="Đã thuộc" value={progress.mastered} />
            <ProgressRow label="Đang học" value={progress.learning} />
            <ProgressRow label="Chưa học" value={progress.fresh} />
          </ul>

          <p className="mt-space-md font-label-sm text-label-sm text-outline tabular">
            Chuỗi ôn: {progress.streak} ngày · retrievability trung bình{" "}
            {Math.round(progress.avgRetrievability * 100)}%
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setGradedCount(0);
            setLastInterval(null);
            router.refresh();
          }}
          className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Ôn tiếp
        </button>
      </div>
    );
  }

  /* ══ Còn thẻ ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Ôn tập {lang === "zh" ? "tiếng Trung" : "tiếng Anh"}
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant tabular">
          Thẻ {index + 1}/{cards.length} · {dueCount} đến hạn · {newCount} mới
        </p>
      </header>

      {/* Thanh tiến độ phiên */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-label="Tiến độ phiên ôn"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(index / Math.max(1, cards.length)) * 100}%` }}
        />
      </div>

      {lastInterval && (
        <p role="status" aria-live="polite" className="font-label-sm text-label-sm text-primary">
          Lần sau ôn: {lastInterval}
        </p>
      )}

      {/* Thẻ */}
      <article className="rounded-xl bg-surface-container p-space-lg">
        <div className="flex flex-wrap items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <p className="font-headline-lg text-headline-lg text-on-surface">
              {card.front}
            </p>

            {/* Tiếng Trung: toggle hanzi */}
            {lang === "zh" && card.frontAlt && (
              <button
                type="button"
                onClick={() => setShowHanzi((current) => !current)}
                aria-pressed={showHanzi}
                className="mt-space-xs rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showHanzi ? "Ẩn chữ Hán" : "Hiện chữ Hán"}
              </button>
            )}

            {showHanzi && card.frontAlt && (
              <p className="mt-space-xs font-headline-md text-headline-md text-on-surface">
                {card.frontAlt}
              </p>
            )}

            {/* Phiên âm gợi ý (en) — chỉ 2 tuần đầu */}
            {lang === "en" && card.showHint && card.hint && (
              <button
                type="button"
                onClick={() => setShowHint((current) => !current)}
                aria-pressed={showHint}
                className="mt-space-xs rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showHint ? "Ẩn gợi ý" : "Xem gợi ý phát âm"}
              </button>
            )}

            {showHint && card.hint && (
              <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                {card.hint}
              </p>
            )}
          </div>

          {/* TTS */}
          <button
            type="button"
            onClick={() => void speak(card.front)}
            aria-label="Nghe phát âm"
            className="rounded-lg bg-surface-container-high p-2 text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="volume_up" size={20} />
          </button>
        </div>

        {/* Mặt sau */}
        {revealed ? (
          <div className="mt-space-lg border-t border-outline-variant pt-space-lg">
            <p className="font-headline-md text-headline-md text-on-surface">
              {card.back}
            </p>

            {card.example && (
              <p className="mt-space-sm text-body-sm text-body-sm text-on-surface-variant">
                {card.example}
              </p>
            )}

            {card.note && (
              <p className="mt-space-sm font-label-sm text-label-sm text-outline">
                {card.note}
              </p>
            )}

            {/* 4 nút chấm điểm FSRS */}
            <div className="mt-space-lg grid grid-cols-2 gap-space-sm sm:grid-cols-4">
              {([1, 2, 3, 4] as Grade[]).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => void grade(rating)}
                  disabled={busy}
                  className={cn(
                    "rounded-lg px-3 py-2 font-label-md text-label-md transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    rating === 1
                      ? "bg-error-container/25 text-error hover:brightness-105"
                      : rating === 4
                        ? "bg-primary-container text-on-primary hover:brightness-105"
                        : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
                  )}
                >
                  {GRADE_LABELS[rating]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-space-lg w-full rounded-lg bg-secondary-container px-4 py-2.5 font-label-md text-label-md text-secondary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Hiện mặt sau
          </button>
        )}
      </article>

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-baseline justify-between gap-space-sm">
      <span className="font-body-sm text-body-sm text-on-surface">{label}</span>
      <span className="font-headline-sm text-headline-sm text-on-surface tabular">
        {value}
      </span>
    </li>
  );
}
