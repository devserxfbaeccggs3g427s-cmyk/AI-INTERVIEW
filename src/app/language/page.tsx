import { prisma } from "@/lib/db";
import { getSrsProgress } from "@/lib/srs";
import type { SrsLang } from "@/lib/srs-types";

import { LanguageDeck } from "@/components/srs/language-deck";

export const dynamic = "force-dynamic";

/**
 * S08 — Bảng thẻ ngôn ngữ (`/language`).
 *
 * ⚠️ AC-LG-6 — tiến độ & streak riêng từng ngôn ngữ.
 * ⚠️ P3/P7 — số thẻ đã thuộc / đang học / chưa học (bằng chứng), không % mơ hồ.
 */
export default async function LanguagePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang: SrsLang = params.lang === "en" ? "en" : "zh";

  const [cards, progress] = await Promise.all([
    prisma.card.findMany({
      where: { lang },
      orderBy: [{ due: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        front: true,
        frontAlt: true,
        back: true,
        note: true,
        example: true,
        group: true,
        mode: true,
        due: true,
        reps: true,
        lapses: true,
        stability: true,
        difficulty: true,
      },
    }),
    getSrsProgress(lang),
  ]);

  return (
    <LanguageDeck
      lang={lang}
      progress={progress}
      cards={cards.map((card) => ({
        id: card.id,
        front: card.front,
        frontAlt: card.frontAlt,
        back: card.back,
        note: card.note,
        example: card.example,
        group: card.group,
        mode: card.mode,
        due: card.due.toISOString(),
        reps: card.reps,
        lapses: card.lapses,
        stability: card.stability,
        difficulty: card.difficulty,
      }))}
    />
  );
}
