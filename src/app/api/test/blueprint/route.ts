/**
 * `POST /api/test/blueprint` — AI-14 dựng đề kiểm tra ngoại ngữ (FR-AI-17).
 *
 * Hợp đồng:
 *   Request : `{ lang: "zh"|"en", level: string, topic?: string, itemTypes: ItemType[], count: number, seed?: string, useCards?: boolean }`
 *   Response: `{ ok: true, data: { testId: string, items: GeneratedItem[] } }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * - **KHÔNG** gọi AI (task "test_blueprint" là AI-free — design.md §6.1 ghi chú 3).
 * - Dùng `generateBlueprint` từ `src/lib/test-gen.ts` — chọn lọc tất định từ thẻ yếu + ngân hàng seed.
 * - Cùng `seed` → cùng đề (task 14.17 "đề song song về độ khó").
 * - Tạo `TestSession` + `TestItem` rows trong DB.
 * - Không ghi `AiCall` (router sẽ trả lỗi `unavailable` nếu gọi `callAi("test_blueprint")`).
 *
 * Xem tasks.md 14.4 · design.md §4.19 / §4.20 / §6.1 · FR-LT-01 / FR-LT-10 / FR-AI-17.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { generateBlueprint, type BlueprintRequest, type GeneratedItem, ITEM_TYPES } from "@/lib/test-gen";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
  level: z.string().min(1),
  topic: z.string().nullable().optional(),
  itemTypes: z.array(z.enum(ITEM_TYPES)).min(1).max(6),
  count: z.number().int().min(1).max(60),
  seed: z.string().nullable().optional(),
  useCards: z.boolean().optional(),
});

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

    const req: BlueprintRequest = {
      lang: parsed.data.lang,
      level: parsed.data.level,
      topic: parsed.data.topic ?? null,
      itemTypes: parsed.data.itemTypes,
      count: parsed.data.count,
      seed: parsed.data.seed ?? null,
      useCards: parsed.data.useCards,
    };

    // Sinh đề tất định (không gọi AI)
    const items = await generateBlueprint(req);

    // Tạo TestSession + TestItem trong 1 transaction
    const now = new Date();
    const testSession = await prisma.testSession.create({
      data: {
        lang: req.lang,
        testType: req.topic ? "topic" : "placement",
        topic: req.topic,
        level: req.level,
        blueprint: {
          itemTypes: req.itemTypes,
          count: req.count,
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
      include: { items: { orderBy: { index: "asc" } } },
    });

    return NextResponse.json({
      ok: true,
      data: {
        testId: testSession.id,
        items: testSession.items.map((item) => ({
          index: item.index,
          itemType: item.itemType,
          prompt: item.prompt,
          audioText: item.audioText,
          options: item.options,
          answer: item.answer,
          cardId: item.cardId,
          skillName: item.skillName,
          difficulty: item.difficulty,
        })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }
    console.error("[api/test/blueprint]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể tạo đề kiểm tra" } },
      { status: 500 },
    );
  }
}