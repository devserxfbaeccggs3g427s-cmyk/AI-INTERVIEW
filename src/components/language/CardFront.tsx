"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

/**
 * S10 `CardFront` — mặt trước thẻ ôn tập.
 *
 * Hiển thị:
 *   - zh: pinyin (bắt buộc) + hanzi (tuỳ chọn, có nút toggle) + nút nghe TTS (zh-CN)
 *   - en: từ (word) + gợi ý phiên âm kiểu Việt trong 14 ngày đầu (task 10.11)
 *
 * Xem tasks.md 10.7, 10.11 · design.md §4.10.
 */

interface CardFrontProps {
  /** Ngôn ngữ: `zh` hoặc `en`. */
  lang: "zh" | "en";
  /** Pinyin (zh) hoặc từ (en). */
  front: string;
  /** Hanzi (zh, tuỳ chọn). */
  hanzi?: string | null;
  /** Callback khi người dùng bật/tắt hanzi. */
  onToggleHanzi?: (show: boolean) => void;
  /** Trạng thái hiện hanzi. */
  showHanzi?: boolean;
  /** Gợi ý phiên âm (en: tiếng Việt). */
  hint?: string | null;
  /** Thời gian tạo thẻ — dùng để ẩn hint sau 14 ngày (en). */
  createdAt?: string | null;
}

export function CardFront({
  lang,
  front,
  hanzi,
  onToggleHanzi,
  showHanzi = false,
  hint,
  createdAt,
}: CardFrontProps) {
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "zh" ? "zh-CN" : "en-US";
    utterance.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  // 10.11 — gợi ý phiên âm cho thẻ en, tự động ẩn sau 14 ngày.
  const showHint =
    lang === "en" && hint && createdAt
      ? (() => {
          const created = new Date(createdAt);
          const now = new Date();
          const daysDiff = (now.getTime() - created.getTime()) / 86_400_000;
          return daysDiff <= 14;
        })()
      : false;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-gutter-md p-gutter-lg",
        "rounded-xl bg-surface-container-low border border-outline-variant/30",
        "min-h-[280px] w-full max-w-md mx-auto",
      )}
      aria-live="polite"
    >
      {/* Nội dung chính: pinyin (zh) / từ (en) */}
      <p
        className={cn(
          "text-center break-all",
          lang === "zh"
            ? "font-body-lg text-on-surface"
            : "font-body-xl text-on-surface",
        )}
        style={{ letterSpacing: lang === "zh" ? "0.02em" : "0.04em" }}
      >
        {front}
      </p>

      {/* Hanzi — chỉ zh, toggle tuỳ chọn */}
      {lang === "zh" && hanzi && (
        <>
          {showHanzi && (
            <p
              className="font-body-xl text-on-surface text-center break-all"
              style={{ letterSpacing: "0.04em" }}
            >
              {hanzi}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={showHanzi ? "visibility_off" : "visibility"}
            onClick={() => onToggleHanzi?.(!showHanzi)}
            className="mt-space-sm"
            aria-label={showHanzi ? "Ẩn Hán tự" : "Hiện Hán tự"}
          >
            {showHanzi ? "Ẩn Hán tự" : "Hiện Hán tự"}
          </Button>
        </>
      )}

      {/* 10.11 — gợi ý phiên âm tiếng Việt cho en, tự ẩn sau 14 ngày */}
      {showHint && (
        <p className="font-body-sm text-on-surface-variant/80 text-center break-all">
          {hint}
        </p>
      )}

      {/* Nút nghe TTS */}
      <Button
        variant="secondary"
        size="sm"
        icon="volume_up"
        onClick={() => speak(hanzi ?? front)}
        aria-label="Nghe phát âm"
      >
        Nghe phát âm
      </Button>
    </div>
  );
}