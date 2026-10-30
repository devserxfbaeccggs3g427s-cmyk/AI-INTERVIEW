/**
 * S06 — Nhật ký & phản hồi AI `/journal` (tasks.md 12.1–12.7).
 *
 * Server Component: đọc lịch sử `Reflection` từ DB rồi truyền xuống
 * `JournalView` (Client Component) để render phần tương tác.
 *
 * Layout: trái 8 (editor + phản hồi AI) / phải 4 (gợi ý + phân loại + lịch sử).
 *
 * Xem tasks.md 12.1–12.7 · design.md §4.6.
 */

import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { JournalView } from "@/components/journal/JournalView";
import type { JournalEntryDTO } from "@/lib/journal";

/** Đọc 20 entry gần nhất từ `Reflection` join `Activity`. */
async function getInitialEntries(): Promise<JournalEntryDTO[]> {
  const reflections = await prisma.reflection.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      activity: {
        select: {
          id: true,
          title: true,
          domain: true,
          createdAt: true,
          skill: { select: { name: true } },
        },
      },
    },
  });

  return reflections.map((r) => ({
    id: r.id,
    activityId: r.activityId,
    title: r.activity.title,
    prompt: r.prompt,
    answer: r.answer,
    aiFeedback: r.aiFeedback,
    domain: r.activity.domain as JournalEntryDTO["domain"],
    skillName: r.activity.skill?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export default async function JournalPage() {
  const initialEntries = await getInitialEntries();

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Nhật ký · AI-05 / AI-06"
        title="Nhật ký & phản hồi AI"
        description="Ghi lại suy nghĩ trong ngày và nhận phản hồi từ AI. Nội dung chỉ được gửi đi khi bạn bấm nút Phân tích."
      />

      <JournalView initialEntries={initialEntries} />
    </div>
  );
}