/**
 * `POST /api/srs/next` — lấy thẻ đến hạn ôn tập.
 *
 * Luồng:
 *   1. Lấy tối đa 20 thẻ có `due <= now` (đến hạn) theo ngôn ngữ được chọn.
 *   2. Nếu chưa đủ 20, lấy thêm thẻ mới (`reps = 0`) để điền đủ.
 *   3. Trả về mảng thẻ đã sắp xếp: đến hạn trước, thẻ mới sau.
 *
 * Request: `{ lang: "zh" | "en", limit?: number }`
 * Response: `{ ok: true, data: Card[] }` | `{ ok: false, error: { code, message } }`
 *
 * Xem tasks.md 10.2 · design.md §4.9 · FR-SR-01.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  /** Ngôn ngữ ôn: `zh` hoặc `en`. */
  lang: z.enum(["zh", "en"]),
  /** Số thẻ tối đa (mặc định 20). */
  limit: z.number().int().min(1).max(50).default(20),
  /**
   * Thẻ cụ thể để ôn (task 14.16 — nút "Ôn ngay" trên S21).
   * Nếu có → trả về **đúng** các thẻ này (theo thứ tự), bỏ qua luồng
   * due/new. Client truyền từ param URL `reviewCard`.
   */
  cardIds: z.array(z.string()).optional(),
});

type CardOutput = {
  id: string;
  lang: string;
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
  createdAt: string; // ISO — dùng để tính 14-day hint hiển thị cho thẻ en
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lang, limit, cardIds } = RequestBody.parse(body);

    // Nếu được yêu cầu ôn một batch thẻ cụ thể (task 14.16), trả về đúng chúng.
    // Bỏ qua luồng due/new để S10 hiện đúng thẻ vừa sai.
    if (cardIds && cardIds.length > 0) {
      const cards = await prisma.card.findMany({
        where: { id: { in: cardIds } },
        orderBy: { due: "asc" },
        take: limit,
      });

      // Map theo đúng thứ tự `cardIds` để client hiển thị đúng thứ tự.
      const byId = new Map(cards.map((c) => [c.id, c]));
      const ordered = cardIds.map((id) => byId.get(id)).filter(Boolean) as typeof cards;

      const data: CardOutput[] = ordered.map((c) => ({
        id: c.id,
        lang: c.lang,
        front: c.front,
        frontAlt: c.frontAlt,
        back: c.back,
        note: c.note,
        example: c.example,
        examplePinyin: c.examplePinyin,
        hint: c.hint,
        group: c.group,
        mode: c.mode,
        due: c.due.toISOString(),
        stability: c.stability,
        difficulty: c.difficulty,
        reps: c.reps,
        lapses: c.lapses,
        createdAt: c.createdAt.toISOString(),
      }));

      return NextResponse.json({ ok: true, data });
    }

    const now = new Date();

    // 1. Lấy thẻ đến hạn (due <= now) — ưu tiên theo due cũ nhất
    const dueCards = await prisma.card.findMany({
      where: {
        lang,
        due: { lte: now },
      },
      orderBy: { due: "asc" },
      take: limit,
    });

    let cards = [...dueCards];

    // 2. Nếu chưa đủ limit, lấy thêm thẻ mới (reps = 0) chưa từng ôn
    if (cards.length < limit) {
      const remaining = limit - cards.length;
      const newCards = await prisma.card.findMany({
        where: {
          lang,
          reps: 0,
          // Loại trừ những thẻ đã có trong dueCards
          NOT: { id: { in: dueCards.map((c) => c.id) } },
        },
        orderBy: { createdAt: "asc" },
        take: remaining,
      });
      cards = [...cards, ...newCards];
    }

    // Map to output type
    const data: CardOutput[] = cards.map((c) => ({
      id: c.id,
      lang: c.lang,
      front: c.front,
      frontAlt: c.frontAlt,
      back: c.back,
      note: c.note,
      example: c.example,
      examplePinyin: c.examplePinyin,
      hint: c.hint,
      group: c.group,
      mode: c.mode,
      due: c.due.toISOString(),
      stability: c.stability,
      difficulty: c.difficulty,
      reps: c.reps,
      lapses: c.lapses,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }
    console.error("[srs/next]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể lấy thẻ ôn" } },
      { status: 500 },
    );
  }
}