"use client";

import { Button, cn } from "@/components/ui/Button";

/**
 * S10 `CardBack` — mặt sau thẻ ôn tập.
 *
 * Hiển thị: hanzi + nghĩa + ví dụ + nút nghe TTS (zh-CN).
 * Nếu ví dụ có pinyin → hiển thị kèm.
 *
 * Xem tasks.md 10.8 · design.md §4.10.
 */

interface CardBackProps {
  /** Hanzi (bắt buộc). */
  hanzi: string;
  /** Nghĩa (tiếng Việt). */
  meaning: string;
  /** Ví dụ câu (tuỳ chọn). */
  example?: string | null;
  /** Pinyin của ví dụ (tuỳ chọn). */
  examplePinyin?: string | null;
}

export function CardBack({
  hanzi,
  meaning,
  example,
  examplePinyin,
}: CardBackProps) {
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-gutter-md p-gutter-lg",
        "rounded-xl bg-surface-container-low border border-outline-variant/30",
        "min-h-[280px] w-full max-w-md mx-auto",
      )}
      aria-live="polite"
    >
      {/* Hanzi */}
      <p
        className="font-body-xl text-on-surface text-center break-all"
        style={{ letterSpacing: "0.04em" }}
      >
        {hanzi}
      </p>

      {/* Nghĩa */}
      <p className="font-body-md text-on-surface-variant text-center break-all">
        {meaning}
      </p>

      {/* Ví dụ */}
      {example && (
        <div className="w-full max-w-md space-y-space-xs">
          <p
            className="font-body-sm text-primary text-center break-all"
            style={{ letterSpacing: "0.02em" }}
          >
            {example}
          </p>
          {examplePinyin && (
            <p
              className="font-body-xs text-on-surface-variant/70 text-center break-all"
            >
              {examplePinyin}
            </p>
          )}
        </div>
      )}

      {/* Nút nghe TTS */}
      <Button
        variant="secondary"
        size="sm"
        icon="volume_up"
        onClick={() => speak(hanzi)}
        aria-label="Nghe phát âm"
      >
        Nghe phát âm
      </Button>
    </div>
  );
}