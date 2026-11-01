import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import {
  buildObjectiveExplanation,
  isOpenType,
  scoreObjective,
  type ItemType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

const AnswerSchema = z.object({
  testId: z.string().min(1),
  index: z.number().int().min(0),
  userAnswer: z.string().max(4_000),
  seconds: z.number().int().min(0).max(7_200).optional(),
  flagged: z.boolean().optional(),
});

/**
 * POST /api/test/answer — lưu 1 câu + chấm objective ngay (FR-LT-15).
 *
 * ⚠️ D2: route này **KHÔNG** ghi `Card` — chỉ `POST /api/test/submit` mới được
 * đẩy thẻ về ôn.
 * ⚠️ D9: upsert theo unique `(testId, index)` — double-click không tạo bản ghi trùng.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = AnswerSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")),
    );
  }

  const { testId, index, userAnswer, seconds, flagged } = parsed.data;

  const session = await prisma.testSession.findUnique({
    where: { id: testId },
    select: { id: true, status: true },
  });
  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên kiểm tra"));
  }
  if (session.status !== "active") {
    return toResponse(fail("conflict", "Phiên kiểm tra đã nộp — không thể sửa câu"));
  }

  const existing = await prisma.testItem.findUnique({
    where: { testId_index: { testId, index } },
    select: { id: true },
  });
  if (!existing) {
    return toResponse(fail("not_found", "Chỉ số câu không tồn tại"));
  }

  const item = await prisma.testItem.findUnique({
    where: { testId_index: { testId, index } },
    select: {
      id: true,
      itemType: true,
      answer: true,
      options: true,
      cardId: true,
      flagged: true,
    },
  });
  if (!item) {
    return toResponse(fail("not_found", "Chỉ số câu không tồn tại"));
  }

  const itemType = item.itemType as ItemType;
  const trimmed = userAnswer.trim();

  // ── Câu tự luận: chờ AI-15 (isCorrect = null, scored = false) ───────────
  if (isOpenType(itemType)) {
    await prisma.testItem.update({
      where: { id: item.id },
      data: {
        userAnswer: trimmed,
        seconds: seconds ?? null,
        flagged: flagged ?? item.flagged,
        isCorrect: null,
        scored: false,
      },
    });

    return toResponse(
      ok({
        saved: true as const,
        index,
        isCorrect: null,
        pendingAi: true,
        elapsedTotal: seconds ?? 0,
      }),
    );
  }

  // ── Câu objective: chấm ngay ───────────────────────────────────────────
  const altAnswers = await loadAltAnswers(item.cardId);
  const { isCorrect } = scoreObjective(
    { itemType, answer: item.answer, options: toOptions(item.options) },
    trimmed,
    altAnswers,
  );

  const explanation = isCorrect
    ? `Đáp án đúng là “${item.answer ?? ""}”.`
    : buildObjectiveExplanation({
        itemType,
        answer: item.answer,
        options: toOptions(item.options),
      });

  await prisma.testItem.update({
    where: { id: item.id },
    data: {
      userAnswer: trimmed,
      isCorrect,
      notes: explanation,
      explanation,
      seconds: seconds ?? null,
      flagged: flagged ?? item.flagged,
      scored: true,
    },
  });

  return toResponse(
    ok({
      saved: true as const,
      index,
      isCorrect,
      correctAnswer: item.answer,
      explanation,
      elapsedTotal: seconds ?? 0,
    }),
  );
}

function toOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((item): item is string => typeof item === "string");
}

/** Biến thể chấp nhận cho `cloze` — pinyin (`frontAlt`) của thẻ liên quan. */
async function loadAltAnswers(cardId: string | null): Promise<string[]> {
  if (!cardId) return [];
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { frontAlt: true, front: true },
  });
  if (!card) return [];
  return [card.frontAlt, card.front].filter((v): v is string => Boolean(v));
}
