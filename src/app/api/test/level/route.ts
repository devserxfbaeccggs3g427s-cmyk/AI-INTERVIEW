import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { AiError, isAiAvailable } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import { estimateLevelWithAi } from "@/lib/test-ai";
import {
  estimateLevelLocal,
  hskForLevel,
  levelLabel,
  summarizeSession,
  type ItemType,
  type Lang,
  type LevelCode,
  type ScoredItem,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LevelSchema = z.object({
  testId: z.string().min(1),
});

/**
 * POST /api/test/level — AI-16: ước lượng level sau bài.
 *
 * ⚠️ Thiếu API key ⇒ trả `source: "local"` (HTTP 200, **không** lỗi).
 * ⚠️ AI lỗi ⇒ `source: "local"` (số liệu cục bộ luôn có sẵn).
 * ⚠️ AI lệch > 1 bậc ⇒ `clampLevel()` kéo về band code (LT-R6).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = LevelSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "testId không hợp lệ"));
  }

  const session = await prisma.testSession.findUnique({
    where: { id: parsed.data.testId },
    select: {
      id: true,
      lang: true,
      testType: true,
      durationSec: true,
      startedAt: true,
      endedAt: true,
      items: {
        orderBy: { index: "asc" },
        select: {
          index: true,
          itemType: true,
          prompt: true,
          audioText: true,
          options: true,
          answer: true,
          userAnswer: true,
          isCorrect: true,
          cardId: true,
          skillName: true,
          errorGroups: true,
          rubric: true,
          notes: true,
          explanation: true,
          seconds: true,
          flagged: true,
          scored: true,
        },
      },
    },
  });

  if (!session) {
    return toResponse(fail("not_found", "Không tìm thấy phiên kiểm tra"));
  }

  const items = session.items.map((row) => toScoredItem(row));
  const durationSec = session.durationSec ?? 0;

  const summary = summarizeSession(items, {
    testId: session.id,
    lang: session.lang as Lang,
    testType: session.testType as TestType,
    durationSec,
  });

  const local = estimateLevelLocal(summary.byItemType, summary.score, summary.maxScore);

  // ── Offline: ước lượng cục bộ, HTTP 200 ────────────────────────────────
  if (!isAiAvailable()) {
    await persistLevel(session.id, local.level, "local");
    return toResponse(
      ok({
        level: local.level,
        levelLabel: levelLabel(session.lang as Lang, local.level),
        cefr: local.level,
        hsk: hskForLevel(local.level),
        confidence: 0.5,
        bottleneck: local.bottleneck,
        reason: "Ước lượng cục bộ theo tỷ lệ đúng theo dạng câu (chưa có API key).",
        source: "local" as const,
      }),
    );
  }

  try {
    const ai = await estimateLevelWithAi({
      lang: session.lang,
      summary,
      localLevel: local.level,
    });

    await persistLevel(session.id, ai.level, "ai");

    return toResponse(
      ok({
        level: ai.level,
        levelLabel: levelLabel(session.lang as Lang, ai.level),
        cefr: ai.cefr,
        hsk: ai.hsk,
        confidence: ai.confidence,
        bottleneck: ai.bottleneck ?? local.bottleneck,
        reason: ai.reason,
        source: "ai" as const,
      }),
    );
  } catch (error) {
    // AI lỗi ⇒ vẫn trả ước lượng cục bộ (số liệu thật, không giả lập).
    await persistLevel(session.id, local.level, "local");
    const message = error instanceof AiError ? error.userMessage : "AI không phản hồi";
    return toResponse(
      ok({
        level: local.level,
        levelLabel: levelLabel(session.lang as Lang, local.level),
        cefr: local.level,
        hsk: hskForLevel(local.level),
        confidence: 0.5,
        bottleneck: local.bottleneck,
        reason: `Ước lượng cục bộ (AI lỗi: ${message}).`,
        source: "local" as const,
      }),
    );
  }
}

async function persistLevel(
  testId: string,
  level: LevelCode,
  source: "ai" | "local",
): Promise<void> {
  await prisma.testSession.update({
    where: { id: testId },
    data: { level, levelSource: source },
  });
}

/** Chuyển row Prisma → `ScoredItem` (chấu hóa kiểu, không `any`). */
function toScoredItem(row: {
  index: number;
  itemType: string;
  prompt: string;
  audioText: string | null;
  options: unknown;
  answer: string | null;
  userAnswer: string | null;
  isCorrect: boolean | null;
  cardId: string | null;
  skillName: string | null;
  errorGroups: unknown;
  rubric: unknown;
  notes: string | null;
  explanation: string | null;
  seconds: number | null;
  flagged: boolean;
  scored: boolean;
}): ScoredItem {
  return {
    index: row.index,
    itemType: row.itemType as ItemType,
    prompt: row.prompt,
    audioText: row.audioText,
    options: Array.isArray(row.options)
      ? row.options.filter((o): o is string => typeof o === "string")
      : null,
    answer: row.answer,
    userAnswer: row.userAnswer,
    isCorrect: row.isCorrect,
    cardId: row.cardId,
    skillName: row.skillName,
    errorGroups: isErrorGroups(row.errorGroups) ? row.errorGroups : null,
    rubric: isRubric(row.rubric) ? row.rubric : null,
    notes: row.notes,
    explanation: row.explanation,
    seconds: row.seconds,
    flagged: row.flagged,
    scored: row.scored,
  };
}

function isRubric(raw: unknown): raw is ScoredItem["rubric"] {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.grammar === "number" &&
    typeof obj.vocab === "number" &&
    typeof obj.expression === "number" &&
    typeof obj.context === "number"
  );
}

function isErrorGroups(raw: unknown): raw is ScoredItem["errorGroups"] {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    Array.isArray(obj.grammar) &&
    Array.isArray(obj.vocab) &&
    Array.isArray(obj.expression) &&
    Array.isArray(obj.context)
  );
}
