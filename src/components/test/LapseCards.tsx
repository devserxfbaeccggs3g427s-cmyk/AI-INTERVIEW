"use client";

import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";
import { ReviewNowButton } from "@/components/test/ReviewNowButton";
import { color } from "@/styles/tokens";

/**
 * `LapseCards` — danh sách thẻ bị đẩy về ôn do trả lời sai (task 14.16).
 *
 * - Hiển thị tối đa 3 thẻ.
 * - Nút "Ôn ngay" → mở S10 (language/session) để ôn thẻ vừa sai.
 *
 * Props:
 *  - cards: thẻ bị đẩy về, tối đa 3.
 *
 * Xem tasks.md 14.16 · design.md §4.19 / S21.
 */

export interface LapseCard {
  cardId: string;
  front: string; // câu hỏi/thuật ngữ
  back: string;  // đáp án
  lang: "zh" | "en";
}

export interface LapseCardsProps {
  cards: LapseCard[];
  className?: string;
}

export function LapseCards({ cards, className }: LapseCardsProps) {
  // Luôn chỉ hiển thị tối đa 3 thẻ (task 14.16)
  const displayCards = cards.slice(0, 3);

  if (displayCards.length === 0) {
    return (
      <Card className={cn("bg-surface-container-low", className)} tone="low">
        <CardHeader
          title="Thẻ cần ôn"
          icon="check_circle"
        />
        <p className="font-body-sm text-on-surface-variant">
          Không có thẻ nào cần đẩy về ôn.
        </p>
      </Card>
    );
  }

  return (
    <Card className={className} tone="low">
      <CardHeader
        title="Ôn lại thẻ sai"
        subtitle={`${displayCards.length} thẻ`}
        icon="error_outline"
        action={
          displayCards[0] ? (
            <ReviewNowButton cardId={displayCards[0].cardId} />
          ) : null
        }
      />

      <div className="space-y-2">
        {displayCards.map((card) => (
          <div
            key={card.cardId}
            className="rounded-md bg-surface-container p-space-sm border border-outline-variant/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="font-body-md text-on-surface">{card.front}</p>
                <p className="mt-0.5 font-body-sm text-on-surface-variant">
                  Đáp án: {card.back}
                </p>
              </div>
              <ReviewNowButton
                cardId={card.cardId}
                variant="secondary"
                label="Ôn"
                size="sm"
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Thông báo khi không có thẻ sai (task 14.21, 14.12). */
export function LapseCardsEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface-container-low p-space-md text-center",
        className,
      )}
    >
      <span className="material-symbols text-3xl" style={{ color: color("primary") }}>
        check_circle
      </span>
      <p className="mt-2 font-body-sm text-on-surface">
        0 thẻ bị đẩy về ôn
      </p>
    </div>
  );
}