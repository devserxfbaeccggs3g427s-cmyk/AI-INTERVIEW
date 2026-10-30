"use client";

import { Button } from "@/components/ui/Button";
import { Badge, ProgressBar } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { DOMAIN_CHIP_CLASS } from "@/lib/ui";
import {
  ACTIVITY_TYPE_LABELS,
  DOMAIN_LABELS,
  type ActivityType,
  type Domain,
} from "@/lib/types";

/**
 * `AiPrefill` — bước 2 của Quick-log: card AI tự phân tích (task 5.4).
 *
 * Hiển thị: confidence %, domain gợi ý, skill node gợi ý, thời lượng và mức
 * nỗ lực/độ sâu (3 mức). **Mỗi trường có nút "Sửa"** để người dùng chỉnh tay.
 *
 * Checkbox "Tự động tạo 1 Evidence bằng chứng vào Cây kỹ năng" (task 5.5) —
 * giá trị được đưa vào payload `createEvidence` của `POST /api/log`.
 *
 * Khi AI lỗi: hiển thị thông báo + nút "Thử lại", **giữ nguyên nội dung người
 * dùng** (design.md §7.2 · AC-2).
 *
 * Xem tasks.md 5.4 / 5.5 · design.md §4.5.
 */

export type AiPrefillData = {
  confidence: number;
  domain: Domain;
  skillId: string | null;
  skillName: string | null;
  minutes: number;
  effort: "low" | "medium" | "high";
  title: string;
  type: ActivityType;
};

export type AiPrefillField = "domain" | "skill" | "minutes" | "effort" | "title" | "type";

const EFFORT_LABELS: Record<AiPrefillData["effort"], string> = {
  low: "Nhẹ",
  medium: "Vừa",
  high: "Sâu",
};

export function AiPrefill({
  data,
  error,
  loading,
  onRetry,
  onEdit,
  onCreateEvidenceChange,
  createEvidence,
  editable = true,
}: {
  data: AiPrefillData | null;
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
  /** Yêu cầu sửa 1 trường — component cha mở editor tương ứng. */
  onEdit?: (field: AiPrefillField) => void;
  onCreateEvidenceChange?: (value: boolean) => void;
  createEvidence?: boolean;
  editable?: boolean;
}) {
  if (loading) {
    return (
      <Card tone="low" className="flex items-center gap-space-md" aria-live="polite">
        <span className="material-symbols-outlined animate-spin text-secondary" aria-hidden>
          progress_activity
        </span>
        <p className="text-body-md text-on-surface-variant">Local AI đang phân tích nội dung…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card tone="low" className="flex flex-col gap-space-md" aria-live="polite">
        <div className="flex items-center gap-space-md">
          <span className="material-symbols-outlined text-tertiary" aria-hidden>
            info
          </span>
          <p className="text-body-md text-on-surface-variant">{error}</p>
        </div>
        {onRetry ? (
          <Button variant="ghost" size="sm" icon="refresh" onClick={onRetry}>
            Thử lại
          </Button>
        ) : null}
      </Card>
    );
  }

  if (!data) return null;

  const confidencePct = Math.round(data.confidence * 100);

  return (
    <Card tone="low" className="flex flex-col gap-gutter" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary" aria-hidden>
            auto_awesome
          </span>
          <h3 className="font-headline-md text-on-surface">AI tự phân tích</h3>
        </div>
        <Badge tone={confidencePct >= 60 ? "secondary" : "outline"}>{confidencePct}% tin cậy</Badge>
      </div>

      <div>
        <div className="mb-space-sm flex items-baseline justify-between">
          <span className="font-label-sm uppercase tracking-widest text-outline">Độ tin cậy</span>
          <span className="font-code-md text-secondary">{confidencePct}%</span>
        </div>
        <ProgressBar value={confidencePct} tone="secondary" />
      </div>

      {/* Các trường gợi ý — mỗi trường 1 nút "Sửa" */}
      <div className="flex flex-col gap-space-sm">
        <Field
          label="Lĩnh vực"
          value={
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-label-md ${DOMAIN_CHIP_CLASS[data.domain]}`}
            >
              {DOMAIN_LABELS[data.domain]}
            </span>
          }
          onEdit={editable && onEdit ? () => onEdit("domain") : undefined}
        />
        <Field
          label="Kỹ năng gắn kèm"
          value={data.skillName ?? "— chưa gắn —"}
          onEdit={editable && onEdit ? () => onEdit("skill") : undefined}
        />
        <Field
          label="Thời lượng thực tế"
          value={`${data.minutes} phút`}
          onEdit={editable && onEdit ? () => onEdit("minutes") : undefined}
        />
        <Field
          label="Nỗ lực / Độ sâu tư duy"
          value={EFFORT_LABELS[data.effort]}
          onEdit={editable && onEdit ? () => onEdit("effort") : undefined}
        />
        <Field
          label="Tiêu đề"
          value={data.title}
          onEdit={editable && onEdit ? () => onEdit("title") : undefined}
        />
        <Field
          label="Loại hoạt động"
          value={ACTIVITY_TYPE_LABELS[data.type]}
          onEdit={editable && onEdit ? () => onEdit("type") : undefined}
        />
      </div>

      {/* Task 5.5 — checkbox tạo Evidence */}
      {onCreateEvidenceChange ? (
        <label className="flex cursor-pointer items-start gap-space-sm rounded-lg bg-surface-container px-space-md py-space-sm">
          <input
            type="checkbox"
            checked={Boolean(createEvidence)}
            onChange={(e) => onCreateEvidenceChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
            data-testid="create-evidence-checkbox"
          />
          <span className="text-body-sm text-on-surface-variant">
            Tự động tạo 1 Evidence bằng chứng vào Cây kỹ năng
          </span>
        </label>
      ) : null}
    </Card>
  );
}

/** 1 dòng gợi ý + nút "Sửa". */
function Field({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-gutter rounded-lg bg-surface-container px-space-md py-space-sm">
      <div className="min-w-0">
        <div className="font-label-sm uppercase tracking-widest text-outline">{label}</div>
        <div className="truncate text-body-md text-on-surface">{value}</div>
      </div>
      {onEdit ? (
        <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`edit-${label}`}>
          Sửa
        </Button>
      ) : null}
    </div>
  );
}
