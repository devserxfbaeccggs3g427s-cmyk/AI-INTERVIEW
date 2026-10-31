import { env } from "@/lib/env";
import { getContextQuestions, getDraft, resolveJournalContext } from "@/lib/journal";
import { toDateKey } from "@/lib/dates";

import { JournalSheet } from "@/components/journal/journal-sheet";

export const dynamic = "force-dynamic";

/**
 * S06 — Nhật ký & phản hồi AI (`/journal`).
 *
 * ⚠️ FR-PS-07 — nhật ký lưu cục bộ. Chỉ khi bấm "Gửi AI phản hồi" thì nội
 * dung mới rời máy (qua `POST /api/journal/feedback-ai`).
 */
export default async function JournalPage() {
  const now = new Date();
  const context = resolveJournalContext(now);
  const questions = getContextQuestions(context).map((text) => ({ text }));

  // ⚠️ FR-PSJ-01 — khôi phục bản nháp đang mở sau khi tải lại trang.
  const draft = await getDraft();

  return (
    <JournalSheet
      date={toDateKey(now)}
      context={context}
      questions={questions}
      aiEnabled={!env.isOffline}
      initialId={draft?.id ?? null}
      initialContent={draft?.answer ?? ""}
      initialAiSummary={draft?.aiSummary ?? null}
      initialAiQuestion={draft?.aiQuestion ?? null}
      initialStatus={draft?.status ?? "draft"}
    />
  );
}
