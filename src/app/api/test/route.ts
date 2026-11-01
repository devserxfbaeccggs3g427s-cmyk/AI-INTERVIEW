import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { isAiAvailable } from "@/lib/anthropic";
import {
  getPushedCardCountToday,
  type ItemType,
  type Lang,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  lang: z.enum(["zh", "en"]),
});

const TYPE_FILTER = z.enum(["placement", "topic", "benchmark", "from_content"]).optional();

/**
 * GET /api/test — dữ liệu hub S19 (FR-LT-01..12).
 *
 * ⚠️ NFR-LT-06: mọi số liệu query từ DB — không có số bịa trong UI.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ lang: url.searchParams.get("lang") ?? undefined });

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "lang phải là `zh` hoặc `en`"));
  }

  const lang = parsed.data.lang as Lang;
  const typeParam = url.searchParams.get("type");
  const typeFilter = typeParam ? TYPE_FILTER.safeParse(typeParam) : null;
  if (typeParam && (!typeFilter || !typeFilter.success)) {
    return toResponse(fail("invalid_input", "type không hợp lệ"));
  }

  try {
    const [profile, sessions, byItemType, topWrongWords, pushedCards, placements, topics, benchmarks] =
      await Promise.all([
        loadProfileLevel(lang),
        loadSessions(lang, typeFilter?.success ? typeFilter.data : undefined),
        loadAccuracyByItemType(lang),
        loadTopWrongWords(lang, 5),
        getPushedCardCountToday(lang),
        loadTypeSessions(lang, "placement"),
        loadTypeSessions(lang, "topic"),
        loadTypeSessions(lang, "benchmark"),
      ]);

    return toResponse(
      ok({
        lang,
        profile: {
          level: profile,
          hasApiKey: isAiAvailable(),
        },
        placements,
        topics,
        benchmarks,
        benchmarkTrend: sessions
          .filter((s) => s.testType === "benchmark")
          .map((s) => ({
            id: s.id,
            label: s.label,
            rate: s.maxScore > 0 ? s.score / s.maxScore : 0,
            level: s.level,
            date: s.date,
          }))
          .reverse(),
        byItemType,
        topWrongWords,
        pushedCards: { count: pushedCards },
      }),
    );
  } catch (error) {
    return toResponse(
      fail("db_error", error instanceof Error ? error.message : "Không tải được dữ liệu bài kiểm tra"),
    );
  }
}

async function loadProfileLevel(lang: Lang): Promise<string> {
  const profile = await prisma.userProfile.findFirst({
    select: { zhLevel: true, enLevel: true },
  });
  if (!profile) return "zero";
  return lang === "zh" ? profile.zhLevel : profile.enLevel;
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

async function loadSessions(lang: Lang, type?: TestType): Promise<SessionRow[]> {
  const rows = await prisma.testSession.findMany({
    where: {
      lang,
      ...(type ? { testType: type } : {}),
      status: { in: ["done", "expired"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
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

  return rows.map((row) => ({
    id: row.id,
    testType: row.testType as TestType,
    topic: row.topic,
    score: row.score ?? 0,
    maxScore: row.maxScore ?? 0,
    level: row.level,
    label: formatSessionLabel(row.testType, row.topic),
    date: row.createdAt.toISOString(),
  }));
}

async function loadTypeSessions(lang: Lang, testType: TestType): Promise<SessionRow[]> {
  return loadSessions(lang, testType);
}

function formatSessionLabel(testType: string, topic: string | null): string {
  const labels: Record<string, string> = {
    placement: "Định vị",
    topic: topic ?? "Chủ đề",
    benchmark: "Chuẩn",
    from_content: "Nội dung",
  };
  return labels[testType] ?? testType;
}

/**
 * Tỷ lệ đúng theo dạng câu — 2 query (count tổng + count đúng).
 *
 * ⚠️ KHÔNG dùng `_sum` trên boolean (SQLite không hỗ trợ).
 */
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

  const correctMap = new Map(
    correctRows.map((row) => [row.itemType, row._count._all]),
  );

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

/** 5 từ sai nhiều nhất — `Card` có `lapses` cao nhất. */
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
