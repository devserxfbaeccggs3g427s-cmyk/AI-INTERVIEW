"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { JOURNAL_PROMPT_SUGGESTIONS, appendPrompt } from "@/lib/journal";

/**
 * `PromptSuggestions` — 3 gợi ý câu hỏi mở theo ngữ cảnh (tasks.md 12.2 · S06).
 *
 * Ngữ cảnh: **sau buổi học** / **cuối ngày** / **cuối tuần** (requirements.md 4.2).
 *
 * Bấm 1 gợi ý → **chèn vào cuối** nội dung đang có, KHÔNG ghi đè. Hàm
 * `appendPrompt` trong `src/lib/journal.ts` là nguồn sự thật cho hành vi này.
 *
 * Xem tasks.md 12.2 · design.md §4.6.
 */

export function PromptSuggestions({
  content,
  onInsert,
  className,
}: {
  /** Nội dung hiện tại trong editor. */
  content: string;
  /** Callback nhận nội dung **đã chèn** (cuối nội dung cũ). */
  onInsert: (next: string) => void;
  className?: string;
}) {
  return (
    <Card tone="low" className={cn("flex flex-col gap-space-md", className)}>
      <CardHeader
        title="Gợi ý câu hỏi đào sâu"
        subtitle="Bấm để chèn vào cuối nội dung nhật ký."
        icon="lightbulb"
      />

      <div className="flex flex-col gap-space-sm" data-testid="journal-prompt-suggestions">
        {JOURNAL_PROMPT_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onInsert(appendPrompt(content, s.prompt))}
            data-testid={`journal-prompt-${s.id}`}
            className="group flex items-start gap-space-sm rounded-lg bg-surface-container px-space-md py-space-sm text-left transition-colors hover:bg-surface-container-high"
          >
            <span
              className="material-symbols-outlined mt-0.5 shrink-0 text-secondary"
              style={{ fontSize: "1rem" }}
              aria-hidden
            >
              {s.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-label-md text-on-surface">{s.label}</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">{s.prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
