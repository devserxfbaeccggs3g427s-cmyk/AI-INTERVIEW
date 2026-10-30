/**
 * `POST /api/srs/grade` — chấm 1 thẻ + cập nhật Card + ghi Review log.
 *
 * Luồng:
 *   1. Đọc Card hiện tại (kèm `cardState` JSON).
 *   2. Gọi `scheduleCard(state, rating, now)` → state mới + due/stability/difficulty.
 *   3. Cập nhật Card: `cardState`, `due`, `stability`, `difficulty`, `reps+1`, `lapses+1` nếu rating=1.
 *   4. Ghi `Review` log: `cardId`, `rating`, `state` (state mới), `at`.
 *
 * Request: `{ cardId: string, rating: 1|2|3|4 }`
 * Response: `{ ok: true, data: { card: Card, review: Review, nextIntervals: Record<number, string> } }`
 *           | `{ ok: false, error: { code, message } }`
 *
 * Xem tasks.md 10.3 · design.md §4.10 · FR-SR-02.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { scheduleCard, type Card as FsrsCard, toRating, type Grade } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  /** ID thẻ cần chấm. */
  cardId: z.string().cuid(),
  /** Rating: 1=Again, 2=Hard, 3=Good, 4=Easy. */
  rating: z.number().int().min(1).max(4),
});

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} giây`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} giờ`;
  const days = hours / 24;
  return `${Math.round(days)} ngày`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cardId, rating } = RequestBody.parse(body);
    const now = new Date();
    const grade = toRating(rating);

    // 1. Đọc Card hiện tại
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        cardState: true,
        reps: true,
        lapses: true,
      },
    });

    if (!card) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Thẻ không tồn tại" } },
        { status: 404 },
      );
    }

    // 2. Gọi FSRS để chấm
    const currentState = card.cardState as unknown as FsrsCard;
    const { card: newState, due, stability, difficulty } = scheduleCard(currentState, grade, now);
    const newStateJson = JSON.parse(JSON.stringify(newState));

    // 3. Cập nhật Card + ghi Review trong transaction
    const [updatedCard, review] = await prisma.$transaction([
      prisma.card.update({
        where: { id: cardId },
        data: {
          cardState: newStateJson,
          due,
          stability,
          difficulty,
          reps: { increment: 1 },
          lapses: { increment: rating === 1 ? 1 : 0 },
        },
      }),
      prisma.review.create({
        data: {
          cardId,
          rating,
          state: newStateJson,
          at: now,
        },
      }),
    ]);

    // 4. Tính khoảng cách ôn tiếp theo cho 4 rating (để hiển thị trên GradeButtons)
    // Dùng f.repeat để preview
    const { fsrs: f } = await import("ts-fsrs");
    const fsrsInstance = f({
      enable_fuzz: false,
      enable_short_term: false,
    });

    const nextIntervals: Record<number, string> = {};
    for (const r of [1, 2, 3, 4] as const) {
      const preview = fsrsInstance.next(newState, now, r);
      const intervalSec = (preview.card.due.getTime() - now.getTime()) / 1000;
      nextIntervals[r] = formatInterval(intervalSec);
    }

    return NextResponse.json({
      ok: true,
      data: {
        card: {
          id: updatedCard.id,
          due: updatedCard.due.toISOString(),
          stability: updatedCard.stability,
          difficulty: updatedCard.difficulty,
          reps: updatedCard.reps,
          lapses: updatedCard.lapses,
        },
        review: {
          id: review.id,
          rating: review.rating,
          at: review.at.toISOString(),
        },
        nextIntervals,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }
    console.error("[srs/grade]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể chấm thẻ" } },
      { status: 500 },
    );
  }
}