import { TestHub, type TestHubData } from "@/components/test/test-hub";
import { isAiAvailable } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import {
  getPushedCardCountToday,
  TEST_TOPIC_GROUPS,
  type ItemType,
  type Lang,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

/**
 * S19 — Danh sách bài kiểm tra.
 *
 * ⚠️ Server Component — đọc `?lang=` + query DB, render khung trang.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang: Lang = params.lang === "en" ? "en" : "zh";

  const data = await loadHubData(lang);

  return (
    <TestHub initialLang={lang} data={data} topicGroups={TEST_TOPIC_GROUPS[lang]} />
  );
}

interface SessionRow {
  id: string;
  testType: TestType;
  topic: string | null;
  score: number;
  maxScore: number;
  level: string | null;
  label: string;
  date: string;
}

async function loadHubData(lang: Lang): Promise<TestHubData> {
  const [profile, placements, topics, benchmarks, byItemType, topWrongWords, pushedCount] =
    await Promise.all([
      prisma.userProfile.findFirst({ select: { zhLevel: true, enLevel: true } }),
      loadTypeSessions(lang, "placement"),
      loadTypeSessions(lang, "topic"),
      loadTypeSessions(lang, "benchmark"),
      loadAccuracyByItemType(lang),
      loadTopWrongWords(lang, 5),
      getPushedCardCountToday(lang),
    ]);

  const level = lang === "zh" ? profile?.zhLevel : profile?.enLevel;

  return {
    lang,
    profile: { level: level ?? "zero", hasApiKey: isAiAvailable() },
    placements,
    topics,
    benchmarks,
    benchmarkTrend: benchmarks
      .slice()
      .reverse()
      .map((session) => ({
        id: session.id,
        label: session.label,
        rate: session.maxScore > 0 ? session.score / session.maxScore : 0,
        level: session.level,
        date: session.date,
      })),
    byItemType,
    topWrongWords,
    pushedCards: { count: pushedCount },
  };
}

async function loadTypeSessions(lang: Lang, testType: TestType): Promise<SessionRow[]> {
  const rows = await prisma.testSession.findMany({
    where: { lang, testType, status: { in: ["done", "expired"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      testType: true,
      topic: true,
      score: true,
      maxScore: true,
      level: true,
      createdAt: true,
    },
  });

  const labels: Record<TestType, string> = {
    placement: "Định vị",
    topic: "Chủ đề",
    benchmark: "Chuẩn",
    from_content: "Nội dung",
  };

  return rows.map((row) => ({
    id: row.id,
    testType: row.testType as TestType,
    topic: row.topic,
    score: row.score ?? 0,
    maxScore: row.maxScore ?? 0,
    level: row.level,
    label: row.topic ?? labels[row.testType as TestType],
    date: row.createdAt.toISOString(),
  }));
}

async function loadAccuracyByItemType(
  lang: Lang,
): Promise<Array<{ itemType: ItemType; correct: number; total: number; rate: number }>> {
  const totals = await prisma.testItem.groupBy({
    by: ["itemType"],
    where: { test: { lang } },
    _count: { _all: true },
  });

  const correctRows = await prisma.testItem.groupBy({
    by: ["itemType"],
    where: { test: { lang }, isCorrect: true },
    _count: { _all: true },
  });

  const correctMap = new Map(correctRows.map((row) => [row.itemType, row._count._all]));

  return totals.map((row) => {
    const total = row._count._all;
    const correct = correctMap.get(row.itemType) ?? 0;
    return {
      itemType: row.itemType as ItemType,
      correct,
      total,
      rate: total === 0 ? 0 : correct / total,
    };
  });
}

async function loadTopWrongWords(
  lang: Lang,
  limit: number,
): Promise<Array<{ cardId: string; front: string; frontAlt: string | null; back: string; wrongCount: number }>> {
  const rows = await prisma.card.findMany({
    where: { lang, lapses: { gt: 0 } },
    orderBy: [{ lapses: "desc" }, { difficulty: "desc" }],
    take: limit,
    select: { id: true, front: true, frontAlt: true, back: true, lapses: true },
  });

  return rows.map((row) => ({
    cardId: row.id,
    front: row.front,
    frontAlt: row.frontAlt,
    back: row.back,
    wrongCount: row.lapses,
  }));
}
