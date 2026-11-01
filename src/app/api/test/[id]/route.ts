import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { getPushedCardsForSession } from "@/lib/test";
import {
  estimateLevelLocal,
  hskForLevel,
  levelLabel,
  suggestedGroupForLevel,
  summarizeSession,
  type ItemType,
  type Lang,
  type LevelCode,
  type ScoredItem,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

/**
 * GET /api/test/[id] — dữ liệu S21 (kết quả bài kiểm tra).
 *
 * ⚠️ FR-LT-12: `comparison` chỉ có khi phiên trước có **cùng `formSignature`**
 * — đề khác độ khó thì không tính delta.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const session = await prisma.testSession.findUnique({
    where: { id },
    select: {
      id: true,
      lang: true,
      testType: true,
      topic: true,
      status: true,
      score: true,
      maxScore: true,
      durationSec: true,
      level: true,
      levelSource: true,
      formSignature: true,
      standard: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
      activityId: true,
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

  const lang = session.lang as Lang;
  const testType = session.testType as TestType;
  const items = session.items.map((row) => toScoredItem(row));

  const summary = summarizeSession(items, {
    testId: session.id,
    lang,
    testType,
    durationSec: session.durationSec ?? 0,
  });

  const pushedCards = await getPushedCardsForSession(session.id);

  // ── So sánh với phiên trước (FR-LT-12) ────────────────────────────────
  const comparison = await buildComparison(session, testType);

  const level = (session.level ?? summary.levelLocal) as LevelCode;
  const local = estimateLevelLocal(summary.byItemType, summary.score, summary.maxScore);

  // Chỉ `placement` mới có gợi ý nhóm từ (FR-LT-07).
  const suggestedGroup =
    testType === "placement" ? suggestedGroupForLevel(lang, level) : null;

  // Evidence gắn với Activity của phiên.
  const evidence = session.activityId
    ? await prisma.evidence.findFirst({
        where: { activityId: session.activityId },
        select: { id: true },
      })
    : null;

  return toResponse(
    ok({
      session: {
        id: session.id,
        lang,
        testType,
        topic: session.topic,
        status: session.status,
        score: session.score ?? summary.score,
        maxScore: session.maxScore ?? summary.maxScore,
        durationSec: session.durationSec ?? 0,
        level,
        levelLabel: levelLabel(lang, level),
        hsk: hskForLevel(level),
        standard: session.standard,
        createdAt: session.createdAt.toISOString(),
      },
      items,
      byItemType: summary.byItemType,
      wrongItems: summary.wrongItems.map((item) => ({
        index: item.index,
        itemType: item.itemType,
        prompt: item.prompt,
        audioText: item.audioText,
        userAnswer: item.userAnswer,
        answer: item.answer,
        notes: item.notes,
        explanation: item.explanation,
        cardId: item.cardId,
        flagged: item.flagged,
        scored: item.scored,
        rubric: item.rubric,
        errorGroups: item.errorGroups,
        seconds: item.seconds,
      })),
      pushedCards,
      comparison: comparison.comparison,
      comparisonUnavailableReason: comparison.reason,
      suggestedGroup,
      levelSource: session.levelSource,
      bottleneck: local.bottleneck,
      activityId: session.activityId,
      evidenceId: evidence?.id ?? null,
    }),
  );
}

interface SessionForComparison {
  id: string;
  lang: string;
  testType: string;
  formSignature: string | null;
  createdAt: Date;
  score: number | null;
  maxScore: number | null;
}

async function buildComparison(
  session: SessionForComparison,
  testType: TestType,
): Promise<{
  comparison: {
    prevScore: number;
    prevMaxScore: number;
    deltaCorrect: number;
    prevDate: string;
    prevId: string;
  } | null;
  reason: string | null;
}> {
  if (testType !== "benchmark") {
    return { comparison: null, reason: null };
  }

  const prev = await prisma.testSession.findFirst({
    where: {
      lang: session.lang,
      testType: "benchmark",
      status: { in: ["done", "expired"] },
      id: { not: session.id },
      createdAt: { lt: session.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      formSignature: true,
      createdAt: true,
      score: true,
      maxScore: true,
    },
  });

  if (!prev) {
    return { comparison: null, reason: "Chưa có kỳ thi trước để so sánh" };
  }

  if (session.formSignature && prev.formSignature !== session.formSignature) {
    return {
      comparison: null,
      reason: "Đề không cùng độ khó với kỳ trước — không tính delta",
    };
  }

  return {
    comparison: {
      prevScore: prev.score ?? 0,
      prevMaxScore: prev.maxScore ?? 0,
      deltaCorrect: 0,
      prevDate: prev.createdAt.toISOString(),
      prevId: prev.id,
    },
    reason: null,
  };
}

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
