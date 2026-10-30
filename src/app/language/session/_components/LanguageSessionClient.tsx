"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CardFront } from "@/components/language/CardFront";
import { CardBack } from "@/components/language/CardBack";
import { GradeButtons } from "@/components/language/GradeButtons";
import { SessionProgress } from "@/components/language/SessionProgress";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

/**
 * S10 — phiên bản client của trang ôn thẻ SRS (task 14.16).
 *
 * Tách ra thành client component riêng vì dùng `useSearchParams()` — wrapper
 * server ở `page.tsx` bọc trong `<Suspense>` để prerender không báo lỗi.
 *
 * Xem tasks.md 10.7-10.12, 14.16 · design.md §4.10.
 */

interface SrsCard {
  id: string;
  lang: "zh" | "en";
  front: string;
  frontAlt: string | null;
  back: string;
  note: string | null;
  example: string | null;
  examplePinyin: string | null;
  hint: string | null;
  group: string | null;
  mode: string;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  createdAt: string | null;
}

interface GradeResponse {
  ok: true;
  data: {
    card: SrsCard;
    review: { id: string; rating: number; at: string };
    nextIntervals: Record<number, string>;
  };
}

interface NextResponse {
  ok: true;
  data: SrsCard[];
}

export function LanguageSessionClient() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  /**
   * Task 14.16 — nút "Ôn ngay" trên S21 mở S10 với batch thẻ cụ thể.
   * URL: `/language/session?reviewCard=<cardId>` (hoặc `reviewCards=a,b,c`).
   * Truyền `cardIds` xuống `/api/srs/next` để server trả đúng thẻ này/thế.
   */
  const reviewCardParam = searchParams.get("reviewCard");
  const reviewCardsParam = searchParams.getAll("reviewCard");

  /** Danh sách cardId cần ôn (ưu tiên reviewCards, hỗ trợ reviewCard đơn). */
  const reviewCardIds: string[] = reviewCardParam
    ? [reviewCardParam]
    : reviewCardsParam;

  const [cards, setCards] = useState<SrsCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [nextIntervals, setNextIntervals] = useState<Record<number, string>>({});
  const [showHanzi, setShowHanzi] = useState(false);

  const total = cards.length;
  const card = cards[currentIndex] ?? null;

  const loadBatch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/srs/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "zh", limit: 20, cardIds: reviewCardIds.length > 0 ? reviewCardIds : undefined }),
      });
      const data = (await res.json()) as NextResponse | { ok: false; error: { code: string; message: string } };
      if (!data.ok) throw new Error(data.error.message);
      if (data.data.length === 0) {
        toast({ tone: "info", title: "Hết thẻ", description: "Không còn thẻ để ôn. Hãy thêm thẻ mới ở S09." });
        setCards([]);
        return;
      }
      setCards(data.data);
      setCurrentIndex(0);
      setShowBack(false);
      setShowHanzi(false);
      setNextIntervals({});
    } catch (err) {
      toast({ tone: "error", title: "Lỗi", description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load batch on mount
  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  const handleGrade = async (rating: 1 | 2 | 3 | 4) => {
    if (!card || grading) return;
    setGrading(true);
    try {
      const res = await fetch("/api/srs/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, rating }),
      });
      const data = (await res.json()) as GradeResponse | { ok: false; error: { code: string; message: string } };
      if (!data.ok) throw new Error(data.error.message);
      setNextIntervals(data.data.nextIntervals);
      // Sau chấm xong, chuyển sang thẻ tiếp theo trong batch sau 1 giây
      const nextIdx = currentIndex + 1;
      if (nextIdx < cards.length) {
        setTimeout(() => {
          setCurrentIndex(nextIdx);
          setShowBack(false);
          setShowHanzi(false);
          setNextIntervals({});
        }, 1000);
      } else {
        // Hết batch → tải thẻ mới
        setTimeout(() => loadBatch(), 1000);
      }
    } catch (err) {
      toast({ tone: "error", title: "Chấm thất bại", description: String(err) });
    } finally {
      setGrading(false);
    }
  };

  const flipCard = () => setShowBack(true);

  if (loading && !card) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <PageHeader
          eyebrow="Ngoại ngữ · SRS"
          title="Đang tải thẻ..."
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-gutter-lg">
        <PageHeader
          eyebrow="Ngoại ngữ · SRS"
          title="Hết thẻ ôn"
          description="Không còn thẻ nào đến hạn. Hãy thêm thẻ mới ở S09."
        />
        <Button variant="primary" onClick={loadBatch} icon="refresh">
          Tải lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow={`Ngoại ngữ · ${card.lang === "zh" ? "Trung" : "Anh"} · SRS`}
        title={showBack ? "Đáp án" : "Thẻ ôn tập"}
        description={`Thẻ ${showBack ? "đã lật" : "chưa lật"} · ${card.reps} lượt ôn`}
      />

      {/* 10.10 — thanh tiến trình phiên ôn */}
      <SessionProgress currentIndex={currentIndex + 1} total={total} />

      <div className="flex flex-col items-center gap-gutter-lg">
        {showBack ? (
          <CardBack
            hanzi={card.frontAlt ?? card.front}
            meaning={card.back}
            example={card.example}
            examplePinyin={card.examplePinyin}
          />
        ) : (
          <CardFront
            lang={card.lang}
            front={card.front}
            hanzi={card.frontAlt}
            showHanzi={showHanzi}
            onToggleHanzi={setShowHanzi}
            hint={card.hint}
            createdAt={card.createdAt}
          />
        )}

        {showBack ? (
          <GradeButtons
            onGrade={handleGrade}
            loading={grading}
            nextIntervals={nextIntervals}
          />
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon="visibility"
            onClick={flipCard}
            className="w-full max-w-md"
          >
            Xem đáp án
          </Button>
        )}
      </div>

      {/* Hint cho zh — en hint được xử lý trong CardFront (10.11) */}
      {card.lang === "zh" && card.hint && (
        <p className="font-body-sm text-on-surface-variant/70 text-center max-w-md">
          💡 {card.hint}
        </p>
      )}
    </div>
  );
}
