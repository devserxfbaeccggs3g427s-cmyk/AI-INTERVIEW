/**
 * `POST /api/test/similar` — tạo đề "song song" về độ khó (task 14.17, FR-LT-12).
 *
 * Hợp đồng:
 *   Request : `{ testId: string }`
 *   Response: `{ ok: true, data: { testId: string } }`
 *
 * - **Cùng chủ đề + cùng trình độ** với bài gốc → độ khó ngang nhau.
 * - Cùng cơ chế seed tất định (`generateBlueprint`) nhưng **seed khác** → đề khác,
 *   không phải bản sao. Cùng seed ⇒ cùng đề (task 14.4).
 * - Không gọi AI (task `test_blueprint` là AI-free).
 *
 * Xem tasks.md 14.17 · design.md §4.19 · FR-LT-12.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { generateBlueprint, type ItemType } from "@/lib/test-gen";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  testId: z.string().min(1),
});

/** Đọc `seed` đã lưu trong blueprint — fallback về seed tất định theo topic+level. */
function readSeed(blueprint: unknown, fallback: string): string {
  if (blueprint && typeof blueprint === "object" && !Array.isArray(blueprint)) {
    const seed = (blueprint as Record<string, unknown>).seed;
    if (typeof seed === "string" && seed.length > 0) return seed;
  }
  return fallback;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }

    const { testId } = parsed.data;

    const source = await prisma.testSession.findUnique({
      where: { id: testId },
      include: { items: { orderBy: { index: "asc" } } },
    });

    if (!source) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Bài kiểm tra không tìm thấy" } },
        { status: 404 },
      );
    }

    // Lấy cấu hình đề từ blueprint (fallback: suy ra từ items của bài gốc).
    const blueprint = source.blueprint as Record<string, unknown> | null;
    const itemTypes: ItemType[] = Array.isArray(blueprint?.itemTypes)
      ? (blueprint.itemTypes as ItemType[])
      : (Array.from(new Set(source.items.map((i) => i.itemType))) as ItemType[]);

    const count = typeof blueprint?.count === "number"
      ? blueprint.count
      : source.items.length;

    const level = source.level ?? "auto";
    const baseSeed = readSeed(blueprint, `${source.lang}|${level}|${source.topic ?? "-"}|${[...itemTypes].sort().join(",")}|${count}`);

    // Seed KHÁC → đề khác nhưng độ khó ngang nhau (cùng bộ thẻ yếu + cùng ngân hàng seed).
    const similarSeed = `${baseSeed}::similar`;

    const items = await generateBlueprint({
      lang: source.lang as "zh" | "en",
      level,
      topic: source.topic,
      itemTypes,
      count,
      seed: similarSeed,
    });

    const created = await prisma.testSession.create({
      data: {
        lang: source.lang,
        testType: source.testType,
        topic: source.topic,
        level: source.level,
        blueprint: {
          itemTypes,
          count,
          seed: similarSeed,
          similarTo: source.id,
        },
        items: {
          create: items.map((item) => ({
            index: item.index,
            itemType: item.itemType,
            prompt: item.prompt,
            audioText: item.audioText,
            ...(item.options ? { options: item.options } : {}),
            answer: item.answer,
            cardId: item.cardId,
            skillName: item.skillName,
            difficulty: item.difficulty,
          })),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        testId: created.id,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("[api/test/similar]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể tạo đề tương tự" } },
      { status: 500 },
    );
  }
}