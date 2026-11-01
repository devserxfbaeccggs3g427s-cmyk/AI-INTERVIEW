import Link from "next/link";

import {
  TestResultView,
  type PushedCardView,
  type WrongItemView,
} from "@/components/test/test-result-view";
import { prisma } from "@/lib/db";
import {
  estimateLevelLocal,
  getPushedCardsForSession,
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
 * S21 — Kết quả bài kiểm tra.
 *
 * ⚠️ Server Component — đọc kết quả + render.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
    return (
      <div className="space-y-space-md">
        <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
          Không tìm thấy kết quả
        </h1>
        <Link
          href="/test"
          className="inline-flex rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
        >
          Về danh sách bài kiểm tra
        </Link>
      </div>
    );
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
  const level = (session.level ?? summary.levelLocal) as LevelCode;
  const local = estimateLevelLocal(summary.byItemType, summary.score, summary.maxScore);

  const comparison = await buildComparison(session, testType);

  const evidence = session.activityId
    ? await prisma.evidence.findFirst({
        where: { activityId: session.activityId },
        select: { id: true },
      })
    : null;

  return (
    <TestResultView
      session={{
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
      }}
      byItemType={summary.byItemType}
      wrongItems={summary.wrongItems.map((item) => toWrongItem(item))}
      pushedCards={pushedCards as PushedCardView[]}
      comparison={comparison.comparison}
      comparisonUnavailableReason={comparison.reason}
      suggestedGroup={
        testType === "placement" ? suggestedGroupForLevel(lang, level) : null
      }
      levelSource={session.levelSource}
      bottleneck={local.bottleneck}
      activityId={session.activityId}
      evidenceId={evidence?.id ?? null}
    />
  );
}

async function buildComparison(
  session: {
    id: string;
    lang: string;
    formSignature: string | null;
    createdAt: Date;
  },
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
  if (testType !== "benchmark") return { comparison: null, reason: null };

  const prev = await prisma.testSession.findFirst({
    where: {
      lang: session.lang,
      testType: "benchmark",
      status: { in: ["done", "expired"] },
      id: { not: session.id },
      createdAt: { lt: session.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, formSignature: true, createdAt: true, score: true, maxScore: true },
  });

  if (!prev) return { comparison: null, reason: "Chưa có kỳ thi trước để so sánh" };

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

function toWrongItem(item: ScoredItem): WrongItemView {
  return {
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
