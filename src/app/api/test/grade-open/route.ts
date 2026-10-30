/**
 * `POST /api/test/grade-open` — chấm bài kiểm tra: tự động (MC/cloze/listening) + AI (writing/translation).
 *
 * Hợp đồng:
 *   Request : `{ testId: string, answers: { index: number, userAnswer: string, seconds?: number }[] }`
 *   Response: `{ ok: true, data: { totalScore: number, items: GradedItem[], pushedCardCount: number, message: string } }`
 *
 * - **Tự động** (task 14.10): `autoGrade` từ `test-gen.ts` cho mc_vocab, mc_grammar, cloze, listening.
 * - **AI** (task 14.11): `callAi("language_test_grade")` cho writing, translation → `normalizeErrorGroups` đúng 4 nhóm.
 * - **Đẩy thẻ sai về ôn** (task 14.12): chỉ item có `cardId`, `due = startOfDay(now)`, `lapses + 1`.
 * - Trả về `pushedCardCount` + tin nhắn "N thẻ bị đẩy về ôn" (hoặc "0 thẻ bị đẩy về ôn").
 *
 * Xem tasks.md 14.10 / 14.11 / 14.12 · design.md §4.20.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import "server-only";
import { prisma } from "@/lib/db";
import { callAi } from "@/lib/ai/router";
import {
  ITEM_TYPES,
  AI_GRADED_TYPES,
  type ItemType,
  type AutoGradeResult,
  autoGrade,
  normalizeErrorGroups,
  countCorrect,
} from "@/lib/test-gen";
import { SYSTEM_PROMPT_V1, TASK_PROMPT_LANGUAGE_TEST_GRADE } from "@/lib/prompts";
import { startOfDay } from "@/lib/dates";
import { createEmptyCard } from "ts-fsrs";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  testId: z.string().min(1),
  answers: z.array(
    z.object({
      index: z.number().int().min(0),
      userAnswer: z.string(),
      seconds: z.number().int().nonnegative().optional(),
    }),
  ),
});

/** Schema output chấm điểm AI writing/translation — 4 nhóm lỗi. */
const LanguageTestGradeSchema = z.object({
  score: z.number().min(0).max(10),
  errors: z.record(
    z.string(),
    z.array(
      z.object({
        original: z.string(),
        correction: z.string(),
        explanation: z.string(),
      }),
    ),
  ),
});

// Schema cho AI estimate level
const LanguageLevelSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  explanation: z.string(),
});

export type LanguageTestGradeOutput = z.infer<typeof LanguageTestGradeSchema>;

type GradedItem = {
  index: number;
  itemType: ItemType;
  isCorrect: boolean | null;
  score: number; // 0..1 cho auto, 0..10 cho AI
  expected: string;
  errorGroups: Record<string, Array<{ original: string; correction: string; explanation: string }>>;
};

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

    const { testId, answers } = parsed.data;

    // 1. Lấy TestSession + TestItem từ DB
    const testSession = await prisma.testSession.findUnique({
      where: { id: testId },
      include: { items: { orderBy: { index: "asc" } } },
    });

    if (!testSession) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Bài kiểm tra không tìm thấy" } },
        { status: 404 },
      );
    }

    const items = testSession.items;
    const now = new Date();
    const todayStart = startOfDay(now);

    // 2. Map index → TestItem
    const itemsByIndex = new Map(items.map((item) => [item.index, item]));

    // 3. Chuẩn bị lưu answer + chấm
    const gradedItems: GradedItem[] = [];
    let totalAutoScore = 0; // số câu đúng auto
    let totalAiScore = 0; // tổng điểm AI (0..10 mỗi câu)
    let aiGradedCount = 0;
    let pushedCardCount = 0;

    // 4. Lặp qua answers từ client
    for (const ans of answers) {
      const item = itemsByIndex.get(ans.index);
      if (!item) continue;

      const userAnswer = ans.userAnswer ?? "";
      const itemType = item.itemType as ItemType;

      // Cập nhật userAnswer + seconds
      await prisma.testItem.update({
        where: { id: item.id },
        data: {
          userAnswer: userAnswer || null,
          ...(ans.seconds !== undefined ? { seconds: ans.seconds } : {}),
        },
      });

      let graded: GradedItem;

      if (AI_GRADED_TYPES.includes(itemType)) {
        // ── AI chấm writing / translation (task 14.11) ───────────────────────
        const prompt = `Đề bài: ${item.prompt}\n\nBài làm học sinh:\n${userAnswer}\n\nChấm theo 4 nhóm lỗi: Ngữ pháp, Từ vựng, Cách diễn đạt, Ngữ cảnh.`;

        const result = await callAi<LanguageTestGradeOutput>("language_test_grade", {
          system: SYSTEM_PROMPT_V1 + "\n\n" + (Array.isArray(TASK_PROMPT_LANGUAGE_TEST_GRADE) ? TASK_PROMPT_LANGUAGE_TEST_GRADE.join("\n") : TASK_PROMPT_LANGUAGE_TEST_GRADE),
          user: prompt,
          schema: LanguageTestGradeSchema,
          effort: "medium",
        });

        let score = 0;
        let errorGroups: Record<string, Array<{ original: string; correction: string; explanation: string }>> = {};

        if (result.ok) {
          score = Math.max(0, Math.min(10, Math.round(result.data.score)));
          errorGroups = normalizeErrorGroups(result.data.errors);
        } else {
          // Fallback: điểm 0, không lỗi
          score = 0;
          errorGroups = {};
        }

        // Lưu kết quả chấm AI vào TestItem — schema không có cột `score`, nên lưu vào `notes` dạng JSON
        await prisma.testItem.update({
          where: { id: item.id },
          data: {
            isCorrect: score >= 6 ? true : null, // writing/translation không có đúng/sai nhị phân
            errorGroups: errorGroups as Prisma.InputJsonObject,
            notes: JSON.stringify({ score }),
          },
        });

        graded = {
          index: item.index,
          itemType,
          isCorrect: null,
          score,
          expected: item.answer ?? "",
          errorGroups,
        };

        totalAiScore += score;
        aiGradedCount += 1;
      } else {
        // ── Tự động chấm MC / cloze / listening (task 14.10) ──────────────────
        const autoResult: AutoGradeResult = autoGrade(itemType, userAnswer, item.answer ?? "");

        // Lưu kết quả — không có cột `score` nên lưu vào `notes` dạng JSON
        await prisma.testItem.update({
          where: { id: item.id },
          data: {
            isCorrect: autoResult.isCorrect,
            errorGroups: {},
            notes: JSON.stringify({ score: autoResult.score }),
          },
        });

        graded = {
          index: item.index,
          itemType,
          isCorrect: autoResult.isCorrect,
          score: autoResult.score,
          expected: autoResult.expected,
          errorGroups: {},
        };

        if (autoResult.isCorrect) totalAutoScore += 1;

        // ── Task 14.12: Sai + có cardId → đẩy về ôn ────────────────────────────
        if (!autoResult.isCorrect && item.cardId) {
          // Cập nhật Card: due = hôm nay 00:00, lapses + 1, state FSRS reset (newCardState)
          // Dùng scheduleCard để reset state FSRS + cập nhật due/lapses/difficulty/stability
          // Nhưng đơn giản hơn: cập nhật Card trực tiếp
          const existingCard = await prisma.card.findUnique({
            where: { id: item.cardId },
            select: { cardState: true, lapses: true },
          });

          if (existingCard) {
            const newState = createEmptyCard(now);
            // `cardState` là cột Json → Date phải được serialize trước khi ghi.
            const newStateJson = JSON.parse(JSON.stringify(newState));
            await prisma.card.update({
              where: { id: item.cardId },
              data: {
                due: todayStart,
                lapses: { increment: 1 },
                cardState: newStateJson,
              },
            });
            pushedCardCount += 1;
          }
        }
      }

      gradedItems.push(graded);
    }

    // 5. Tổng kết
    const totalScore = totalAutoScore + Math.round(totalAiScore / Math.max(1, aiGradedCount)); // cộng điểm AI trung bình
    const message = pushedCardCount > 0
      ? `${pushedCardCount} thẻ bị đẩy về ôn`
      : "0 thẻ bị đẩy về ôn";

    return NextResponse.json({
      ok: true,
      data: {
        totalScore,
        maxScore: items.length,
        durationSec: answers.reduce((sum, a) => sum + (a.seconds ?? 0), 0),
        items: gradedItems,
        pushedCardCount,
        message,
      },
    });
  } catch (error) {
    console.error("[api/test/grade-open]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể chấm bài" } },
      { status: 500 },
    );
  }
}