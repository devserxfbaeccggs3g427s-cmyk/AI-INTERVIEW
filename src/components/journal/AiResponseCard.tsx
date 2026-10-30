"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { RATING_LABELS, type EvidenceRating } from "@/lib/types";
import { useState } from "react";

/**
 * `AiResponseCard` — khung hiển thị phản hồi AI-05 (tasks.md 12.4 · S06).
 *
 * - **Tóm tắt cốt lõi** (1 câu) — hiển thị dạng text.
 * - **Câu hỏi sắc bén** — đóng khung `border-primary` (yêu cầu của task 12.4).
 * - **Nút "Chấp nhận → tạo Evidence"** — tạo Evidence cho skill được đề xuất,
 *   với rating 1..4 do người dùng chọn.
 * - Nút "Bỏ qua" — không tạo Evidence.
 *
 * Rating chỉ tạo Evidence khi `rating >= 3` mới tăng level skill
 * (FR-SK-03 · `recomputeSkillLevel`).
 *
 * Xem tasks.md 12.4 · design.md §4.6 · FR-SK-03.
 */

export type AiResponseCardProps = {
  /** Tóm tắt 1 câu. */
  summary: string;
  /** Câu hỏi sắc 1 câu. */
  sharpQuestion: string;
  /** Tên skill được đề xuất (null = chưa gắn skill nào). */
  skillName: string | null;
  /** Id skill được đề xuất — dùng để tạo Evidence. */
  skillId: string | null;
  /** Đã tạo Evidence thành công chưa. */
  evidenceCreated?: boolean;
  /** Đang gọi API tạo Evidence. */
  creatingEvidence?: boolean;
  /** Callback khi người dùng bấm "Chấp nhận → tạo Evidence". */
  onAccept?: (rating: EvidenceRating) => void;
  /** Callback khi người dùng bấm "Bỏ qua". */
  onDismiss?: () => void;
  className?: string;
};

const RATINGS: readonly EvidenceRating[] = [1, 2, 3, 4];

export function AiResponseCard({
  summary,
  sharpQuestion,
  skillName,
  skillId,
  evidenceCreated = false,
  creatingEvidence = false,
  onAccept,
  onDismiss,
  className,
}: AiResponseCardProps) {
  const [rating, setRating] = useState<EvidenceRating>(3);

  const canAccept = Boolean(skillId) && !evidenceCreated && !creatingEvidence;

  return (
    <Card
      className={cn("flex flex-col gap-gutter border-primary/50", className)}
      data-testid="journal-ai-response"
    >
      <CardHeader
        title="Phản hồi sắc bén từ AI"
        subtitle="Tóm tắt 1 câu + 1 câu hỏi để tự chất vấn."
        icon="auto_awesome"
        action={<Badge tone="secondary">AI-05</Badge>}
      />

      <div className="flex flex-col gap-space-md">
        <div>
          <Label>Tóm tắt cốt lõi</Label>
          <p className="mt-space-xs text-body-md text-on-surface" data-testid="journal-ai-summary">
            {summary}
          </p>
        </div>

        {/* Khung câu hỏi sắc — `border-primary` (task 12.4). */}
        <div
          className="rounded-lg border border-primary bg-primary-container/10 p-gutter"
          data-testid="journal-ai-sharp-question"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: "1rem" }}
              aria-hidden
            >
              crisis_alert
            </span>
            <Label className="text-primary">Câu hỏi sắc bén (tự chất vấn)</Label>
          </div>
          <p className="mt-space-xs text-body-md text-on-surface">{sharpQuestion}</p>
        </div>
      </div>

      {evidenceCreated ? (
        <div
          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-container/10 px-space-md py-space-sm text-body-sm text-on-surface"
          data-testid="journal-evidence-created"
          role="status"
        >
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "1rem" }} aria-hidden>
            check_circle
          </span>
          Đã tạo 1 Evidence cho skill {skillName ?? ""}.
        </div>
      ) : (
        <div className="flex flex-col gap-space-sm">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-md text-on-surface-variant">Đánh giá bằng chứng:</span>
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                aria-pressed={rating === r}
                data-testid={`journal-rating-${r}`}
                className={cn(
                  "rounded-lg border px-3 py-1 font-label-md transition-colors",
                  rating === r
                    ? "border-primary bg-primary-container/20 text-primary"
                    : "border-outline-variant/40 text-on-surface-variant hover:text-on-surface",
                )}
              >
                {r} · {RATING_LABELS[r]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <Button
              variant="primary"
              size="md"
              icon="verified"
              onClick={() => onAccept?.(rating)}
              loading={creatingEvidence}
              disabled={!canAccept}
              data-testid="journal-accept-evidence"
            >
              Chấp nhận → tạo Evidence
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => onDismiss?.()}
              disabled={creatingEvidence}
              data-testid="journal-dismiss-ai"
            >
              Bỏ qua
            </Button>
          </div>

          {!skillId ? (
            <p className="text-body-sm text-on-surface-variant">
              Chưa có skill nào được đề xuất — bấm "Phân loại" để AI chỉ đúng kỹ năng.
            </p>
          ) : (
            <p className="text-body-sm text-on-surface-variant">
              Evidence sẽ gắn vào skill <strong>{skillName}</strong> (rating {rating}/4 — chỉ
              rating ≥ 3 mới tăng level).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
