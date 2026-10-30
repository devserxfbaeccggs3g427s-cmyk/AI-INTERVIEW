"use client";

import { Badge } from "@/components/ui/Chip";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatVnDate, relativeTime } from "@/lib/dates";
import { DOMAIN_CHIP_CLASS } from "@/lib/ui";
import { parseAiFeedback, type JournalEntryDTO } from "@/lib/journal";
import { DOMAIN_LABELS } from "@/lib/types";

/**
 * `JournalHistory` — lịch sử entry nhật ký + ghi chú AI (tasks.md 12.6 · S06).
 *
 * - Nguồn dữ liệu: bảng `Reflection` join `Activity` liên quan 1-1
 *   (`Reflection.activityId` là `@unique`) — server đọc và truyền xuống.
 * - Mỗi entry hiển thị: ngày · chip domain · trích đoạn (clamp 2 dòng) ·
 *   dòng ghi chú AI nếu có (`Reflection.aiFeedback`).
 *
 * Xem tasks.md 12.6 · design.md §4.6 / §5.2 · requirements.md 4.9.
 */

export function JournalHistory({
  entries,
  className,
}: {
  /** Entry nhật ký mới nhất trước. */
  entries: JournalEntryDTO[];
  className?: string;
}) {
  return (
    <Card tone="low" className={cn("flex flex-col gap-gutter", className)}>
      <CardHeader
        title="Đối chiếu nhật ký gần đây"
        subtitle={`${entries.length} entry gần nhất — kèm ghi chú AI nếu có.`}
        icon="history_edu"
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="menu_book"
          title="Chưa có entry nhật ký nào"
          description="Viết entry đầu tiên ở ô bên trái — mỗi entry sẽ được lưu kèm phản hồi AI nếu bạn bấm “Gửi AI phản hồi”."
        />
      ) : (
        <ul className="flex flex-col gap-space-md" data-testid="journal-history-list">
          {entries.map((entry) => {
            const feedback = parseAiFeedback(entry.aiFeedback);
            return (
              <li key={entry.id}>
                <div className="flex flex-col gap-space-sm rounded-lg border border-outline-variant/25 bg-surface-container p-space-md">
                  <div className="flex flex-wrap items-center justify-between gap-space-sm">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-2 py-0.5 font-label-md",
                          DOMAIN_CHIP_CLASS[entry.domain],
                        )}
                      >
                        {DOMAIN_LABELS[entry.domain]}
                      </span>
                      {entry.skillName ? (
                        <Badge tone="outline">{entry.skillName}</Badge>
                      ) : null}
                    </div>
                    <span className="font-label-sm text-outline">
                      {formatVnDate(entry.createdAt)} · {relativeTime(entry.createdAt)}
                    </span>
                  </div>

                  <p className="line-clamp-2 text-body-md text-on-surface">{entry.answer}</p>

                  {feedback ? (
                    <div className="flex items-start gap-1.5 text-body-sm text-on-surface-variant">
                      <span
                        className="material-symbols-outlined mt-0.5 shrink-0 text-secondary"
                        style={{ fontSize: "0.875rem" }}
                        aria-hidden
                      >
                        lightbulb
                      </span>
                      <span className="min-w-0">
                        <span className="font-label-md text-secondary">AI:</span>{" "}
                        {feedback.summary}
                        {feedback.sharpQuestion ? (
                          <span className="mt-0.5 block text-on-surface-variant">
                            {feedback.sharpQuestion}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
