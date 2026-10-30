"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { providerModelLabel, type JournalClassifyResult } from "@/lib/journal";
import { DOMAIN_LABELS } from "@/lib/types";

/**
 * `ClassifyCard` — kết quả phân loại tự động của AI-06 (tasks.md 12.5 · S06).
 *
 * - Badge provider đọc từ `meta.provider` + `meta.model` — **không hardcode**
 *   (FR-AI-11). Với provider local + `qwen2.5:7b` → `Local · qwen2.5:7b`.
 * - Hiển thị domain + skill + confidence.
 *
 * Xem tasks.md 12.5 · design.md §4.6 / §6.9.
 */

export function ClassifyCard({
  result,
  providerLabel,
  loading = false,
  onClassify,
  error = null,
  className,
}: {
  /** Kết quả phân loại (null = chưa chạy). */
  result: JournalClassifyResult | null;
  /** Nhãn provider đã dựng từ meta — dạng `Local · qwen2.5:7b`. */
  providerLabel?: string | null;
  /** Đang gọi AI-06. */
  loading?: boolean;
  /** Callback khi người dùng bấm "Phân loại". */
  onClassify: () => void;
  /** Lỗi AI (nếu có). */
  error?: string | null;
  className?: string;
}) {
  return (
    <Card tone="low" className={cn("flex flex-col gap-gutter", className)}>
      <CardHeader
        title="Phân loại tự động"
        subtitle="AI-06 chạy local — 0 token, không gửi lên cloud."
        icon="category"
        action={
          providerLabel ? <Badge tone="primary">{providerLabel}</Badge> : <Badge tone="outline">Chưa chạy</Badge>
        }
      />

      {error ? (
        <p className="rounded-lg border border-error/30 bg-error-container/20 px-space-md py-space-sm text-body-sm text-on-surface" data-testid="journal-classify-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-space-sm" data-testid="journal-classify-result">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-md text-on-surface-variant">Lĩnh vực:</span>
            <Badge tone="primary">{DOMAIN_LABELS[result.domain]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-md text-on-surface-variant">Kỹ năng:</span>
            <span className="text-body-md text-on-surface">
              {result.skillName ?? "Chưa gắn skill nào"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <Label>Confidence</Label>
            <span className="font-code-md text-primary" data-testid="journal-classify-confidence">
              {result.confidence}%
            </span>
          </div>
        </div>
      ) : (
        <p className="text-body-sm text-on-surface-variant">
          Bấm "Phân loại" để AI gợi ý lĩnh vực và kỹ năng cho nội dung này.
        </p>
      )}

      <Button
        variant="secondary"
        size="md"
        icon="category"
        onClick={onClassify}
        loading={loading}
        disabled={loading}
        data-testid="journal-classify-button"
      >
        Phân loại
      </Button>
    </Card>
  );
}
