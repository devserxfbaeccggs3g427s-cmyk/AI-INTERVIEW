"use client";

import { cn } from "@/lib/cn";
import type { ItemType } from "@/lib/test-types";
import { ITEM_TYPE_LABELS } from "@/lib/test-types";

/**
 * `ItemRenderer` — render 1 câu hỏi theo 6 dạng (task 14.6).
 *
 * 6 dạng:
 *  - mc_vocab / mc_grammar: radio 4 lựa chọn.
 *  - cloze: input text.
 *  - listening: input text + nút TTS để nghe audio.
 *  - writing: textarea (viết/báo đạo).
 *  - translation: textarea (dịch).
 *
 * Props:
 *  - item: { index, itemType, prompt, audioText?, options?, answer?, userAnswer?, isCorrect? }
 *  - value: giá trị hiện tại (đã trả lời hoặc chưa).
 *  - onChange: callback (value: string) khi người dùng chọn/nhập.
 *  - onPlayAudio: callback chơi TTS (dành cho listening).
 *  - disabled: khóa input (khi xem kết quả).
 *  - showAnswer: hiện đáp án đúng.
 *
 * Xem tasks.md 14.6 · design.md §4.19 / S20.
 */

export interface TestItemRenderProps {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText?: string | null;
  options?: string[] | null;
  answer?: string | null;
  userAnswer?: string | null;
  isCorrect?: boolean | null;
  errorGroups?: Record<string, Array<{ original: string; correction: string; explanation: string }>>;
  seconds?: number | null;
  isListeningPlaying?: boolean;
}

export interface ItemRendererProps {
  item: TestItemRenderProps;
  value?: string;
  onChange: (value: string) => void;
  onPlayAudio?: () => void;
  disabled?: boolean;
  showAnswer?: boolean;
  className?: string;
}

export function ItemRenderer({
  item,
  value = "",
  onChange,
  onPlayAudio,
  disabled = false,
  showAnswer = false,
  className,
}: ItemRendererProps) {
  const { itemType, prompt, audioText, options, answer, isCorrect, errorGroups } = item;

  const commonWrapper = cn(
    "flex flex-col gap-space-sm",
    className,
  );

  // Helper: render prompt
  const renderPrompt = (
    <p className="text-body-md text-on-surface whitespace-pre-wrap">{prompt}</p>
  );

  switch (itemType) {
    case "mc_vocab":
    case "mc_grammar": {
      return (
        <div className={commonWrapper} data-testid={`item-${itemType}-${item.index}`}>
          {renderPrompt}
          <div className="flex flex-col gap-2">
            {options?.map((opt, i) => {
              const letter = String.fromCharCode(65 + i); // A, B, C, D
              return (
                <label
                  key={`${item.index}-opt-${i}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-outline-variant/30 p-space-sm cursor-pointer",
                    "hover:bg-surface-container-high transition-colors",
                    value === opt && "border-primary bg-surface-container-high",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name={`q${item.index}`}
                    value={opt}
                    checked={value === opt}
                    onChange={() => !disabled && onChange(opt)}
                    disabled={disabled}
                    className="accent-primary"
                  />
                  <span className="font-label-sm text-on-surface-variant">{letter}.</span>
                  <span className="text-body-sm text-on-surface">{opt}</span>
                </label>
              );
            })}
          </div>
          {disabled && showAnswer && (
            <div className="mt-2 rounded-md bg-surface-container-high p-space-sm">
              <span className="font-label-sm text-primary">Đáp án: {answer}</span>
            </div>
          )}
        </div>
      );
    }

    case "cloze": {
      return (
        <div className={commonWrapper} data-testid={`item-cloze-${item.index}`}>
          {renderPrompt}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Nhập đáp án..."
            className={cn(
              "w-full rounded-md border border-outline-variant/40 bg-surface-container px-3 py-2 font-body-md text-on-surface",
              "focus:outline-none focus:ring-1 focus:ring-primary",
              disabled && "cursor-not-allowed opacity-60",
            )}
          />
          {disabled && showAnswer && (
            <div className="mt-2 rounded-md bg-surface-container-high p-space-sm">
              <span className="font-label-sm text-primary">Đáp án: {answer}</span>
            </div>
          )}
        </div>
      );
    }

    case "listening": {
      return (
        <div className={commonWrapper} data-testid={`item-listening-${item.index}`}>
          {renderPrompt}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="Nhập nghĩa bạn nghe được..."
              className={cn(
                "flex-1 rounded-md border border-outline-variant/40 bg-surface-container px-3 py-2 font-body-md text-on-surface",
                "focus:outline-none focus:ring-1 focus:ring-primary",
                disabled && "cursor-not-allowed opacity-60",
              )}
            />
            {audioText && (
              <button
                type="button"
                onClick={onPlayAudio}
                disabled={disabled}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg",
                  "bg-primary text-on-primary hover:bg-primary-container transition-colors",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                aria-label="Nghe"
              >
                <span className="material-symbols text-xl">volume_up</span>
              </button>
            )}
          </div>
          {disabled && showAnswer && (
            <div className="mt-2 rounded-md bg-surface-container-high p-space-sm">
              <span className="font-label-sm text-primary">Đáp án: {answer}</span>
            </div>
          )}
        </div>
      );
    }

    case "writing":
    case "translation": {
      return (
        <div className={commonWrapper} data-testid={`item-${itemType}-${item.index}`}>
          {renderPrompt}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={itemType === "writing" ? "Nhập bài viết của bạn..." : "Nhập bản dịch của bạn..."}
            rows={6}
            className={cn(
              "w-full resize-y rounded-md border border-outline-variant/40 bg-surface-container px-3 py-2 font-body-md text-on-surface",
              "focus:outline-none focus:ring-1 focus:ring-primary",
              "placeholder:text-on-surface-variant/50",
              disabled && "cursor-not-allowed opacity-60",
            )}
          />
          {disabled && showAnswer && answer && (
            <div className="mt-2 rounded-md bg-surface-container-high p-space-sm">
              <span className="font-label-sm text-on-surface-variant">Đáp án mẫu: {answer}</span>
            </div>
          )}
          {/* Hiển thị nhóóc lỗi AI nếu có */}
          {disabled && errorGroups && (
            <div className="mt-3 space-y-2">
              {Object.entries(errorGroups).map(([groupKey, errors]) => {
                if (!errors || errors.length === 0) return null;
                return (
                  <div key={groupKey} className="rounded-md bg-surface-container-high p-space-sm">
                    <span className="font-label-sm text-tertiary">{groupKey}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    default:
      return (
        <div className={commonWrapper}>
          {renderPrompt}
          <p className="text-body-sm text-error">Dạng câu không hỗ trợ: {itemType}</p>
        </div>
      );
  }
}

/** Tiêu đề dạng câu — tính toán từ itemType. */
export function itemTypeName(itemType: ItemType): string {
  return ITEM_TYPE_LABELS[itemType];
}