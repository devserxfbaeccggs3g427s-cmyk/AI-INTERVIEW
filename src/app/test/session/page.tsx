import Link from "next/link";

import { TestSessionRunner } from "@/components/test/test-session-runner";
import { prisma } from "@/lib/db";
import {
  TEST_TIMERS_SEC,
  type ItemType,
  type Lang,
  type ScoredItem,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

/**
 * S20 — Làm bài.
 *
 * ⚠️ Server Component: đọc `?testId=`, load session + items, render runner.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ testId?: string }>;
}) {
  const params = await searchParams;
  const testId = params.testId;

  if (!testId) {
    return (
      <div className="space-y-space-md">
        <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
          Chưa chọn bài kiểm tra
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Mở danh sách bài kiểm tra để bắt đầu.
        </p>
        <Link
          href="/test"
          className="inline-flex rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
        >
          Về danh sách bài kiểm tra
        </Link>
      </div>
    );
  }

  const session = await prisma.testSession.findUnique({
    where: { id: testId },
    select: {
      id: true,
      lang: true,
      testType: true,
      topic: true,
      level: true,
      status: true,
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
          Không tìm thấy bài kiểm tra
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

  // Phiên đã nộp ⇒ chuyển thẳng sang S21.
  if (session.status !== "active") {
    return (
      <div className="space-y-space-md">
        <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
          Bài kiểm tra đã nộp
        </h1>
        <Link
          href={`/test/${session.id}`}
          className="inline-flex rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
        >
          Xem kết quả
        </Link>
      </div>
    );
  }

  const items = session.items.map((row) => toScoredItem(row));
  const testType = session.testType as TestType;

  return (
    <TestSessionRunner
      test={{
        id: session.id,
        lang: session.lang as Lang,
        testType,
        topic: session.topic,
        level: session.level ?? "zero",
        totalCount: items.length,
        timerSec: TEST_TIMERS_SEC[testType] ?? null,
      }}
      initialItems={items}
    />
  );
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
