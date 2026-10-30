/**
 * `POST /api/srs/progress` — tiến độ từ vựng theo 6 level FSRS.
 *
 * Level dựa trên stability:
 *   Level 0: stability < 1 ngày (chưa ôn / mới)
 *   Level 1: 1-3 ngày
 *   Level 2: 3-7 ngày
 *   Level 3: 7-14 ngày
 *   Level 4: 14-30 ngày
 *   Level 5: >= 30 ngày (đã thuộc)
 *
 * Trả về mảng 6 số 0..1: % thẻ ở mỗi level.
 *
 * Xem tasks.md 10.4 · design.md §4.9.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
});

type ProgressOutput = number[]; // 6 levels

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lang } = RequestBody.parse(body);

    const cards = await prisma.card.findMany({
      where: { lang },
      select: { stability: true },
    });

    // 6 level thresholds (seconds)
    const thresholds: number[] = [
      0, // level 0: new
      1 * 86400, // level 1: 1 day
      3 * 86400, // level 2: 3 days
      7 * 86400, // level 3: 1 week
      14 * 86400, // level 4: 2 weeks
      30 * 86400, // level 5: 1 month+
    ];

    const counts = [0, 0, 0, 0, 0, 0];

    for (const card of cards) {
      const s = card.stability ?? 0;
      let level = 0;
      for (let i = 5; i >= 0; i--) {
        const threshold = thresholds[i];
        if (threshold !== undefined && s >= threshold) {
          level = i;
          break;
        }
      }
      counts[level] = (counts[level] ?? 0) + 1;
    }

    const total = cards.length || 1;
    const progress = counts.map((c) => c / total);

    return NextResponse.json({ ok: true, data: progress });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "PROGRESS_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}