/**
 * `POST /api/srs/cards` — tạo thẻ SRS mới.
 *
 * Dùng cho việc thêm thẻ thủ công từ S09 hub.
 * State FSRS khởi tạo bằng `newCardState()`.
 *
 * Xem tasks.md 10.6 · src/lib/fsrs.ts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { newCardState } from "@/lib/fsrs";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
  front: z.string().min(1).max(200),
  frontAlt: z.string().max(200).nullable().optional(),
  back: z.string().min(1).max(1000),
  note: z.string().max(500).nullable().optional(),
  example: z.string().max(500).nullable().optional(),
  examplePinyin: z.string().max(200).nullable().optional(),
  hint: z.string().max(200).nullable().optional(),
  group: z.string().max(100).nullable().optional(),
  mode: z.enum(["vocab", "sentence", "grammar"]).default("vocab"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = RequestBody.parse(body);
    const now = new Date();
    const initialState = newCardState(now);

    const card = await prisma.card.create({
      data: {
        lang: data.lang,
        front: data.front,
        frontAlt: data.frontAlt ?? null,
        back: data.back,
        note: data.note ?? null,
        example: data.example ?? null,
        examplePinyin: data.examplePinyin ?? null,
        hint: data.hint ?? null,
        group: data.group ?? null,
        mode: data.mode,
        // FSRS state - convert to plain object for Prisma JSON field
        cardState: JSON.parse(JSON.stringify(initialState)),
        due: now,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
      },
    });

    return NextResponse.json({ ok: true, data: card });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "CREATE_CARD_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}