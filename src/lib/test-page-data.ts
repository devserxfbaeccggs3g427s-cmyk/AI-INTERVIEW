/**
 * Tầng dữ liệu cho S19 — trang chọn loại bài kiểm tra ngoại ngữ.
 *
 * Tách khỏi `src/app/test/page.tsx` vì Next.js chỉ cho phép page file export
 * các field đặc biệt (`default`, `dynamic`, `metadata`, `generateMetadata`…);
 * mọi export khác sẽ bị lỗi "is not a valid Page export field".
 *
 * Xem tasks.md 14.1 / 14.2 / 14.3 / 14.20 · design.md §4.19 / S19.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { type TestType } from "@/components/test/TestTypeCard";
import type {
  BenchmarkPeriodPoint,
  ItemTypeAccuracy,
  WrongWord,
} from "@/components/test/BenchmarkChart";
import type { ItemType } from "@/lib/test-types";
import { ITEM_TYPE_LABELS } from "@/lib/test-types";

export interface TestPageData {
  profile: {
    zhLevel: string;
    enLevel: string;
    learningLangs: string;
  } | null;
  benchmarkPeriods: BenchmarkPeriodPoint[];
  itemTypeAccuracies: ItemTypeAccuracy[];
  wrongWords: WrongWord[];
  testTypeConfigs: Array<{
    type: TestType;
    label: string;
    description: string;
    questionCount: number;
    hasTimer: boolean;
    icon: string;
  }>;
}

/** Lấy dữ liệu S19 từ server (tránh gọi nặng ở client). */
export async function getS19Data(): Promise<TestPageData> {
  // 1. UserProfile — để LevelSwitcher hiển thị level + đề xuất word groups.
  const profile = await prisma.userProfile.findFirst({
    select: {
      zhLevel: true,
      enLevel: true,
      learningLangs: true,
    },
  });

  // 2. Lịch sử benchmark — chọn 4 TestSession gần nhất.
  const benchmarkSessions = await prisma.testSession.findMany({
    where: { testType: "benchmark" },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: {
      createdAt: true,
      score: true,
      maxScore: true,
      items: {
        select: { itemType: true, isCorrect: true, answer: true },
      },
    },
  });

  // 3. Dữ liệu benchmark (period points, accuracy per type, wrong words).
  const benchmarkPeriods: BenchmarkPeriodPoint[] = benchmarkSessions
    .map((s, i) => {
      const weeksAgo = i;
      const label = `W${40 - weeksAgo}`;
      const score = s.score ?? 0;
      const maxScore = s.maxScore ?? 1;
      const accuracy = Math.round((score / maxScore) * 100);
      return { label, accuracy };
    })
    .reverse();

  // Tính accuracy per item type từ toàn bộ items trong benchmarkSessions.
  const typeStats: Record<string, { correct: number; total: number }> = {};
  const wrongWordCounts: Record<string, { count: number; itemType: ItemType }> = {};

  for (const session of benchmarkSessions) {
    for (const item of session.items) {
      const type = item.itemType as ItemType;
      if (!typeStats[type]) typeStats[type] = { correct: 0, total: 0 };
      typeStats[type].total += 1;
      if (item.isCorrect) typeStats[type].correct += 1;

      // Đếm từ sai — nếu sai, tăng count cho `answer` (từ đúng).
      if (!item.isCorrect && item.answer) {
        const word = item.answer;
        if (!wrongWordCounts[word]) {
          wrongWordCounts[word] = { count: 0, itemType: type };
        }
        wrongWordCounts[word].count += 1;
      }
    }
  }

  const itemTypeAccuracies: ItemTypeAccuracy[] = Object.entries(typeStats).map(
    ([itemType, stats]) => ({
      itemType: itemType as ItemType,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      correct: stats.correct,
      total: stats.total,
      label: ITEM_TYPE_LABELS[itemType as ItemType] ?? itemType,
    }),
  );

  // 5 từ sai nhiều nhất.
  const sortedWrongWords = Object.entries(wrongWordCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([word, data]) => ({
      word,
      wrongCount: data.count,
      itemType: data.itemType,
    }));

  // 4. Config cho 4 TestTypeCard.
  const testTypeConfigs: TestPageData["testTypeConfigs"] = [
    {
      type: "placement",
      label: "Định vị trình độ",
      description: "Chẩn đoán trình độ, chọn đề phù hợp.",
      questionCount: 20,
      hasTimer: false,
      icon: "psychology",
    },
    {
      type: "topic",
      label: "Theo chủ đề",
      description: "Luyện theo chủ đề đã học.",
      questionCount: 15,
      hasTimer: false,
      icon: "topic",
    },
    {
      type: "benchmark",
      label: "Chuẩn kiểm tra",
      description: "Theo dõi tiến bộ định kỳ.",
      questionCount: 40,
      hasTimer: true,
      icon: "leaderboard",
    },
    {
      type: "from_content",
      label: "Từ nội dung",
      description: "Tạo đề từ đoạn văn bản tùy chỉnh.",
      questionCount: 10,
      hasTimer: true,
      icon: "article",
    },
  ];

  return {
    profile: profile ? {
      zhLevel: profile.zhLevel ?? "zero",
      enLevel: profile.enLevel ?? "zero",
      learningLangs: profile.learningLangs,
    } : null,
    benchmarkPeriods,
    itemTypeAccuracies,
    wrongWords: sortedWrongWords,
    testTypeConfigs,
  };
}
