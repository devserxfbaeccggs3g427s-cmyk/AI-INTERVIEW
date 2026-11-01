import { buildSessionQueue, getSrsProgress } from "@/lib/srs";
import type { SrsLang } from "@/lib/srs-types";

import { SrsReview } from "@/components/srs/srs-review";

export const dynamic = "force-dynamic";

/**
 * S09 — Phiên ôn thẻ (`/srs/review`).
 *
 * ⚠️ AC-LG-2 — thứ tự lấy thẻ: đến hạn trước, thẻ mới sau.
 * ⚠️ AC-LG-10 — đổi ngôn ngữ qua `?lang=` không trộn thẻ.
 */
export default async function SrsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang: SrsLang = params.lang === "en" ? "en" : "zh";

  const [cards, progress] = await Promise.all([
    buildSessionQueue(lang),
    getSrsProgress(lang),
  ]);

  return (
    <SrsReview
      lang={lang}
      cards={cards}
      dueCount={cards.filter((c) => c.reps > 0).length}
      newCount={cards.filter((c) => c.reps === 0).length}
      progress={progress}
    />
  );
}
