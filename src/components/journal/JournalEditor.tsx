"use client";

import { Button } from "@/components/ui/Button";
import { Card, Label } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  JOURNAL_MAX_LENGTH,
  clearJournalDraft,
  readJournalDraft,
  writeJournalDraft,
} from "@/lib/journal";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `JournalEditor` — ô soạn thảo nhật ký + bộ đếm ký tự + bản nháp `localStorage`
 * (tasks.md 12.1 · S06 · AC-14).
 *
 * - **Bộ đếm ký tự** hiện `n / 2000`; vượt giới hạn → viền `error`.
 * - **Bản nháp tự lưu**: mỗi lần gõ → ghi vào `localStorage` (key
 *   `daily-loop-os:journal-draft:v1`). Mở lại trang → khôi phục nguyên văn.
 * - **Markdown hỗ trợ**: nhãn micro ở góc editor.
 * - **Ctrl/Cmd + Enter** → gửi AI (requirements.md 4.12).
 *
 * ⚠️ Privacy (FR-PS-07 · task 12.7): component này **không** tự gọi API.
 * Nội dung chỉ rời máy khi người dùng bấm "Gửi AI phản hồi".
 *
 * Xem tasks.md 12.1 / 12.7 · design.md §4.6.
 */

/** Bộ đếm ký tự — tách riêng để test độc lập (task 12.1). */
export function CharacterCounter({
  value,
  max = JOURNAL_MAX_LENGTH,
  className,
}: {
  /** Nội dung hiện tại. */
  value: string;
  /** Giới hạn ký tự — mặc định 2000. */
  max?: number;
  className?: string;
}) {
  const count = value.length;
  const over = count > max;
  const near = !over && count >= Math.floor(max * 0.9);

  return (
    <span
      className={cn(
        "font-code-md",
        over ? "text-error" : near ? "text-tertiary" : "text-on-surface-variant",
        className,
      )}
      data-testid="journal-char-counter"
      aria-live="polite"
    >
      {count} / {max}
    </span>
  );
}

/** Thông báo "đã khôi phục bản nháp" — hiển thị 1 lần rồi tự ẩn khi bấm. */
function DraftNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg border border-primary/30 bg-primary-container/10 px-space-md py-space-sm"
      data-testid="journal-draft-notice"
      role="status"
    >
      <span className="flex items-center gap-1.5 text-body-sm text-on-surface">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: "1rem" }}
          aria-hidden
        >
          history
        </span>
        Đã khôi phục bản nháp cục bộ — bạn có thể tiếp tục viết.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="font-label-md text-primary hover:underline"
        data-testid="journal-draft-dismiss"
      >
        Bỏ qua
      </button>
    </div>
  );
}

export function JournalEditor({
  value,
  onChange,
  onSubmit,
  submitting = false,
  disabled = false,
  className,
}: {
  /** Nội dung nhật ký (controlled). */
  value: string;
  /** Callback khi nội dung đổi. */
  onChange: (next: string) => void;
  /** Callback khi người dùng bấm nút / Ctrl+Enter — gọi API AI-05. */
  onSubmit: () => void;
  /** Đang gọi AI → nút bị disable + hiện spinner. */
  submitting?: boolean;
  /** Khoá ô nhập (ví dụ đang lưu entry). */
  disabled?: boolean;
  className?: string;
}) {
  const [restored, setRestored] = useState(false);

  // ─── Khôi phục bản nháp khi mở trang (task 12.1 · AC-14) ──────────────────
  // Chạy 1 lần khi mount. Bản nháp chỉ được khôi phục khi editor đang rỗng —
  // nếu người dùng đã gõ thì bản nháp cũ không được ghi đè.
  useEffect(() => {
    const draft = readJournalDraft(window.localStorage);
    if (!draft || draft.content.trim().length === 0) return;
    setRestored(true);
    onChange(draft.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Tự lưu bản nháp mỗi lần gõ (task 12.1) ─────────────────────────────
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (value.trim().length === 0) {
        clearJournalDraft(window.localStorage);
        return;
      }
      writeJournalDraft(window.localStorage, value, Date.now());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter → gửi AI (requirements.md 4.12).
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!submitting && !disabled && value.trim().length > 0) {
          onSubmit();
        }
      }
    },
    [onSubmit, submitting, disabled, value],
  );

  const over = value.length > JOURNAL_MAX_LENGTH;

  return (
    <Card className={cn("flex flex-col gap-gutter", className)}>
      {restored ? <DraftNotice onDismiss={() => setRestored(false)} /> : null}

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <label htmlFor="journal-content" className="font-label-md text-on-surface-variant">
            Nhật ký hôm nay
          </label>
          <div className="flex items-center gap-space-sm">
            <Label>Markdown hỗ trợ</Label>
            <CharacterCounter value={value} />
          </div>
        </div>

        <textarea
          id="journal-content"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={12}
          placeholder="Hôm nay mình học được gì? Điều gì làm mình khựng lại?"
          aria-describedby="journal-editor-hint"
          data-testid="journal-textarea"
          className={cn(
            "w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface",
            "border placeholder:text-outline/70 transition-colors resize-y",
            "focus:outline-none",
            over ? "border-error" : "border-outline-variant/40 focus:border-primary",
          )}
        />
        <p id="journal-editor-hint" className="text-body-sm text-on-surface-variant">
          Bản nháp được giữ lại cục bộ — đóng tab rồi mở lại vẫn còn nội dung.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <span className="font-label-sm text-outline">
          <kbd className="rounded-sm bg-surface-container-high px-1 font-code-md">Ctrl</kbd> +{" "}
          <kbd className="rounded-sm bg-surface-container-high px-1 font-code-md">Enter</kbd> để gửi AI
        </span>
        <Button
          variant="primary"
          size="md"
          icon="auto_awesome"
          onClick={onSubmit}
          loading={submitting}
          disabled={submitting || disabled || value.trim().length === 0}
          data-testid="journal-send-ai"
        >
          Gửi AI phản hồi
        </Button>
      </div>
    </Card>
  );
}
