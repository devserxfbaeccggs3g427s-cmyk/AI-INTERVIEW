/**
 * S21 — trang kết quả bài kiểm tra (task 14.15, 14.16, 14.17, 14.18, 14.19).
 *
 * Server Component (data fetch) → Client Component (interactive).
 * - Hiển thị ResultRadar (6 trục).
 * - LapseCards (tối đa 3 thẻ sai + "Ôn ngay").
 * - WritingEval (4 rubric items / 10).
 * - Nút "Làm bài tương tự" (task 14.17).
 *
 * Xem tasks.md 14.15 / 14.16 / 14.17 / 14.18 / 14.19 · design.md §4.19 / S21.
 */

import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { ResultRadar, type RadarPoint } from "@/components/test/ResultRadar";
import { LapseCards, type LapseCard } from "@/components/test/LapseCards";
import { LapseCardsEmpty } from "@/components/test/LapseCards";
import { WritingEval } from "@/components/test/WritingEval";
import { SimilarTestButton } from "@/components/test/SimilarTestButton";
import { Card } from "@/components/ui/Card";
import { CardHeader, Label } from "@/components/ui/Card";
import { type ItemType, ITEM_TYPE_LABELS } from "@/lib/test-gen";
import { redirect } from "next/navigation";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

interface TestResultData {
  testId: string;
  lang: "zh" | "en";
  testType: string;
  topic: string | null;
  level: string | null;
  score: number | null;
  maxScore: number | null;
  durationSec: number | null;
  items: Array<{
    index: number;
    itemType: string;
    prompt: string;
    answer: string | null;
    userAnswer: string | null;
    isCorrect: boolean | null;
    seconds: number | null;
    cardId: string | null;
    errorGroups: Record<string, Array<{ original: string; correction: string; explanation: string }>> | null;
    notes: string | null;
  }>;
  lapseCards: LapseCard[];
}

/** Fetch dữ liệu kết quả S21 từ server. */
async function getTestData(testId: string): Promise<TestResultData | null> {
  const session = await prisma.testSession.findUnique({
    where: { id: testId },
    include: {
      items: { orderBy: { index: "asc" } },
    },
  });

  if (!session) return null;

  // Xây dựng lapseCards từ items sai có cardId
  const lapseCards: LapseCard[] = await Promise.all(
    session.items
      .filter((item) => !item.isCorrect && item.cardId)
      .slice(0, 3)
      .map(async (item) => {
        const card = await prisma.card.findUnique({
          where: { id: item.cardId! },
          select: { front: true, frontAlt: true, back: true, lang: true },
        });
        return {
          cardId: item.cardId!,
          front: card?.frontAlt ?? card?.front ?? item.prompt,
          back: card?.back ?? item.answer ?? "",
          lang: (card?.lang ?? session.lang) as "zh" | "en",
        };
      }),
  );

  return {
    testId: session.id,
    lang: session.lang as "zh" | "en",
    testType: session.testType,
    topic: session.topic,
    level: session.level,
    score: session.score,
    maxScore: session.maxScore,
    durationSec: session.durationSec,
    items: session.items.map((item) => ({
      index: item.index,
      itemType: item.itemType,
      prompt: item.prompt,
      answer: item.answer,
      userAnswer: item.userAnswer,
      isCorrect: item.isCorrect,
      seconds: item.seconds,
      cardId: item.cardId,
      errorGroups: item.errorGroups as Record<string, Array<{ original: string; correction: string; explanation: string }>> | null,
      notes: item.notes,
    })),
    lapseCards,
  };
}

export default async function TestResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTestData(id);

  if (!data) {
    redirect("/test");
  }

  // Tính toán radar data (task 14.15)
  const radarItems = computeRadarData(data.items);

  const totalScore = data.score ?? 0;
  const maxScore = data.maxScore ?? data.items.length;

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Kết quả bài kiểm tra"
        title="Xem kết quả"
        description={`Điểm: ${totalScore}/${maxScore} ${data.durationSec ? `| Thời gian: ${data.durationSec}s` : ""}`}
        actions={<SimilarTestButton testId={data.testId} />}
      />

      {/* Radar chart (14.15) */}
      <Card className="p-gutter">
        <ResultRadar
          items={radarItems}
          totalScore={totalScore}
          maxScore={maxScore}
        />
      </Card>

      {/* Lapse cards (14.16) */}
      <Card className="p-gutter">
        <CardHeader title="Thẻ cần ôn lại" icon="error" />
        {data.lapseCards.length > 0 ? (
          <LapseCards cards={data.lapseCards} />
        ) : (
          <LapseCardsEmpty />
        )}
      </Card>

      {/* Writing eval (14.18) */}
      {data.items.some((item) => item.itemType === "writing" || item.itemType === "translation") && (
        <Card className="p-gutter">
          <CardHeader title="Đánh giá bài viết" icon="rate_review" />
          {data.items
            .filter((item) => item.itemType === "writing" || item.itemType === "translation")
            .map((item) => {
              const notes = item.notes ? JSON.parse(item.notes) : {};
              const score = typeof notes.score === "number" ? notes.score : 0;
              const errorGroups = item.errorGroups ?? {};

              return (
                <div key={item.index} className="mt-4">
                  <Label>{item.prompt}</Label>
                  <WritingEval
                    score={score}
                    errorGroups={errorGroups}
                    maxScore={10}
                  />
                </div>
              );
            })}
        </Card>
      )}

      {/* Chi tiết từng câu */}
      <Card className="p-gutter">
        <CardHeader title="Chi tiết câu hỏi" icon="list" />
        <div className="space-y-3">
          {data.items.map((item) => {
            const itemTypeName = ITEM_TYPE_LABELS[item.itemType as ItemType] ?? item.itemType;
            const statusColor = item.isCorrect
              ? "text-primary"
              : item.isCorrect === false
                ? "text-error"
                : "text-tertiary";

            return (
              <div
                key={item.index}
                className="rounded-md bg-surface-container-low p-3 border border-outline-variant/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="font-label-sm text-on-surface-variant">
                      Câu {item.index + 1} · {itemTypeName}
                    </span>
                    <p className="mt-1 font-body-sm text-on-surface">{item.prompt}</p>
                    {item.userAnswer && (
                      <p className="mt-1 font-body-sm text-on-surface-variant">
                        Trả lời: {item.userAnswer}
                      </p>
                    )}
                  </div>
                  <span className={cn("font-label-sm", statusColor)}>
                    {item.isCorrect === true ? "✓" : item.isCorrect === false ? "✗" : "--"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** Tính radar data từ items — 6 trục (task 14.15). */
function computeRadarData(items: TestResultData["items"]): RadarPoint[] {
  const types: ItemType[] = ["mc_vocab", "mc_grammar", "cloze", "listening", "writing", "translation"];

  return types.map((type) => {
    const typeItems = items.filter((i) => i.itemType === type);
    const correct = typeItems.filter((i) => i.isCorrect === true).length;
    const total = typeItems.length;
    const autoScore = typeItems.reduce((sum, i) => {
      const notes = i.notes ? JSON.parse(i.notes) : {};
      return sum + (typeof notes.score === "number" ? notes.score : 0);
    }, 0);

    // Score = % đúng cho auto types, trung bình AI score (0..10) cho writing/translation → quy về %)
    let score: number;
    if (total === 0) {
      score = 0;
    } else if (type === "writing" || type === "translation") {
      score = Math.round((autoScore / Math.max(1, typeItems.filter((i) => i.notes).length)) * 10);
    } else {
      score = total > 0 ? Math.round((correct / total) * 100) : 0;
    }

    return {
      itemType: type,
      score,
      correct,
      total,
      label: ITEM_TYPE_LABELS[type],
    };
  });
}