/**
 * `POST /api/srs/export` — xuất deck thẻ SRS ra JSON.
 *
 * Trả về mảng thẻ đầy đủ để backup/chia sẻ.
 *
 * Xem tasks.md 10.6.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
});

type CardExport = {
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
  // Không xuất: id, due, stability, difficulty, reps, lapses, cardState
  // vì khi import sẽ là thẻ mới
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lang } = RequestBody.parse(body);

    const cards = await prisma.card.findMany({
      where: { lang },
      select: {
        lang: true,
        front: true,
        frontAlt: true,
        back: true,
        note: true,
        example: true,
        examplePinyin: true,
        hint: true,
        group: true,
        mode: true,
      },
    });

    return NextResponse.json({ ok: true, data: cards });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "EXPORT_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}