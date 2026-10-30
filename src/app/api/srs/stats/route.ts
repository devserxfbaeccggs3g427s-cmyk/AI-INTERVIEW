/**
 * `POST /api/srs/stats` — thống kê thẻ SRS theo ngôn ngữ.
 *
 * Trả về: studying (reps > 0 && due > now), known (reps > 0 && stability cao),
 * due (due <= now), streak (ngày liên tiếp có review).
 *
 * Xem tasks.md 10.4 · FR-SR-01.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
});

type StatsOutput = {
  studying: number;
  known: number;
  due: number;
  streak: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lang } = RequestBody.parse(body);
    const now = new Date();

    // Lấy tất cả thẻ theo ngôn ngữ
    const cards = await prisma.card.findMany({
      where: { lang },
      select: {
        reps: true,
        due: true,
        stability: true,
      },
    });

    // studying: đã ôn (reps > 0) nhưng chưa thuộc (due > now)
    const studying = cards.filter((c) => c.reps > 0 && new Date(c.due) > now).length;

    // known: đã ôn và stability >= 30 ngày (coi như đã thuộc)
    const known = cards.filter((c) => c.reps > 0 && c.stability >= 30 * 86400).length;

    // due: đến hạn ôn
    const due = cards.filter((c) => new Date(c.due) <= now).length;

    // streak: tính từ Review log
    const reviews = await prisma.review.findMany({
      where: {
        card: { lang },
      },
      select: { at: true },
      orderBy: { at: "desc" },
    });

    // Tính streak: số ngày liên tiếp có ít nhất 1 review
    let streak = 0;
    if (reviews.length > 0) {
      const reviewDates = new Set(
        reviews.map((r) => new Date(r.at).toISOString().slice(0, 10)),
      );
      let checkDate = new Date();
      checkDate.setHours(0, 0, 0, 0);
      while (reviewDates.has(checkDate.toISOString().slice(0, 10))) {
        streak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    return NextResponse.json({ ok: true, data: { studying, known, due, streak } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "STATS_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}