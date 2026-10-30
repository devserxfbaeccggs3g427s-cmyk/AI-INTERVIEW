/**
 * `POST /api/test/from-content` — AI-17 sinh đề từ nội dung tùy chỉnh (S19, task 14.20).
 *
 * Hợp đồng:
 *   Request : `{ lang: "zh"|"en", text: string, itemTypes?: ItemType[], count?: number, topic?: string, level?: string }`
 *   Response: `{ ok: true, data: { testId: string, items: GeneratedItem[] } }`
 *
 * - Provider: `local qwen2.5:7b` (task 14.20).
 * - Chấp nhận văn bản UTF-8 không giới hạn độ dài.
 * - Gọi `callAi("test_from_content")` để sinh câu hỏi từ content → tạo TestSession + TestItem.
 * - Ghi AiCall (provider local → cost 0).
 *
 * Xem tasks.md 14.20 · design.md §6.1 / §4.19.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { callAi } from "@/lib/ai/router";
import { SYSTEM_PROMPT_V1, TASK_PROMPT_TEST_FROM_CONTENT } from "@/lib/prompts";
import { ITEM_TYPES, type ItemType, type GeneratedItem } from "@/lib/test-gen";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  lang: z.enum(["zh", "en"]),
  text: z.string().min(1),
  topic: z.string().optional(),
  level: z.string().optional(),
  itemTypes: z.array(z.enum(ITEM_TYPES)).optional(),
  count: z.number().int().min(1).max(40).optional(),
});

// Schema cho output AI tạo đề từ content
const TestFromContentSchema = z.object({
  items: z.array(
    z.object({
      itemType: z.enum(ITEM_TYPES),
      prompt: z.string(),
      answer: z.string(),
      options: z.array(z.string()).optional(),
      audioText: z.string().optional(),
      difficulty: z.number().int().min(1).max(5).optional(),
    }),
  ),
});

export type TestFromContentOutput = z.infer<typeof TestFromContentSchema>;

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

    const { lang, text, topic, level, itemTypes, count } = parsed.data;

    const requestedTypes = itemTypes ?? ["mc_vocab", "cloze", "listening", "writing", "translation"];
    const requestedCount = count ?? 20;

    // Gọi AI local để sinh đề từ content
    const prompt = `
Ngôn ngữ: ${lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}
Trình độ: ${level ?? "auto"}
Chủ đề: ${topic ?? "tùy chỉnh"}
Số câu cần tạo: ${requestedCount}
Các dạng câu: ${requestedTypes.join(", ")}

Nội dung nguồn:
${text}
`;

    const result = await callAi<TestFromContentOutput>("test_from_content", {
      system: SYSTEM_PROMPT_V1 + "\n\n" + (Array.isArray(TASK_PROMPT_TEST_FROM_CONTENT) ? TASK_PROMPT_TEST_FROM_CONTENT.join("\n") : TASK_PROMPT_TEST_FROM_CONTENT),
      user: prompt,
      schema: TestFromContentSchema,
      effort: "medium",
    });

    let items: GeneratedItem[];

    if (result.ok) {
      // Chuyển output AI sang GeneratedItem
      items = result.data.items.map((it, i) => ({
        index: i,
        itemType: it.itemType,
        prompt: it.prompt,
        answer: it.answer,
        options: it.options ?? null,
        audioText: it.audioText ?? null,
        cardId: null,
        skillName: topic ?? null,
        group: topic ?? null,
        difficulty: it.difficulty ?? 3,
      }));
    } else {
      // Fallback: trả về đề trống hoặc thông báo lỗi
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: result.error.code,
            message: `Không thể tạo đề từ nội dung: ${result.error.message}`,
          },
        },
        { status: 502 },
      );
    }

    // Tạo TestSession + TestItem trong transaction
    const testSession = await prisma.testSession.create({
      data: {
        lang,
        testType: "from_content",
        topic: topic ?? null,
        level: level ?? null,
        blueprint: {
          itemTypes: requestedTypes,
          count: requestedCount,
          source: "ai_local",
        },
        items: {
          create: items.map((item) => ({
            index: item.index,
            itemType: item.itemType as string,
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
  } catch (err) {
    const error = err as Error;
    console.error("[api/test/from-content]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể tạo đề từ nội dung" } },
      { status: 500 },
    );
  }
}