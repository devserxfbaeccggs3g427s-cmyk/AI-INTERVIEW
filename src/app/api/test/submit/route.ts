import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { applyFsrsAgain } from "@/lib/test-fsrs";
import {
  estimateLevelLocal,
  summarizeSession,
  type ItemType,
  type Lang,
  type ScoredItem,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";

const SubmitSchema = z.object({
  testId: z.string().min(1),
  reason: z.enum(["manual", "timeout"]).optional(),
});

/**
 * POST /api/test/submit — tổng kết + đẩy thẻ về ôn + Activity/Evidence.
 *
 * ⚠️ FR-LT-06 / AC-11: mỗi câu sai có `cardId` ⇒ `due = hôm nay`, `lapses + 1`,
 * `stability` giảm, ghi `Review { source: "test" }`.
 * ⚠️ LT-R9: câu bỏ trống ⇒ `isCorrect = false` nhưng **không** đẩy thẻ.
 * ⚠️ Câu gắn cờ ⇒ không đẩy thẻ (FR-LT-17).
 * ⚠️ Toàn bộ bước ghi DB trong **1 transaction**.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", "testId không hợp lệ"));
  }

  const { testId, reason } = parsed.data;

  const session = await prisma.testSession.findUnique({
    where: { id: testId },
    select: {
      id: true,
      lang: true,
      testType: true,
      topic: true,
      status: true,
      startedAt: true,
      durationSec: true,
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
  if (session.status !== "active") {
    return toResponse(fail("conflict", "Phiên kiểm tra đã nộp"));
  }

  const lang = session.lang as Lang;
  const testType = session.testType as TestType;

  // ── Câu bỏ trống ⇒ isCorrect = false, scored = true (không đẩy thẻ) ────
  const items: ScoredItem[] = session.items.map((row) => {
    const scoredItem = toScoredItem(row);
    if (scoredItem.userAnswer === null || scoredItem.userAnswer.trim() === "") {
      return { ...scoredItem, isCorrect: false, scored: true };
    }
    return scoredItem;
  });

  const durationSec =
    session.durationSec ??
    Math.max(0, Math.round((Date.now() - session.startedAt.getTime()) / 1000));

  const summary = summarizeSession(items, {
    testId: session.id,
    lang,
    testType,
    durationSec,
  });

  const local = estimateLevelLocal(summary.byItemType, summary.score, summary.maxScore);
  const status = reason === "timeout" ? "expired" : "done";

  try {
    // ── 1 transaction: câu trống → Activity/Evidence → session ───────────
    const evidenceResult = await prisma.$transaction(async (tx) => {
      // Đánh dấu câu bỏ trống.
      const blankIndexes = session.items
        .filter((row) => !row.userAnswer || row.userAnswer.trim() === "")
        .map((row) => row.index);
      if (blankIndexes.length > 0) {
        await tx.testItem.updateMany({
          where: { testId, index: { in: blankIndexes } },
          data: { isCorrect: false, scored: true },
        });
      }

      // Activity + Evidence (FR-LT-11).
      const minutes = Math.max(1, Math.round(durationSec / 60));
      const scoreRatio = summary.maxScore > 0 ? summary.score / summary.maxScore : 0;

      const activity = await tx.activity.create({
        data: {
          skillId: await resolveSkillId(tx, lang),
          domain: "language",
          type: "test",
          minutes,
          title: buildTitle(lang, testType, session.topic),
          content:
            `Bài kiểm tra ${testType}` +
            (session.topic ? ` · chủ đề ${session.topic}` : "") +
            ` · điểm ${summary.score.toFixed(2)}/${summary.maxScore}` +
            ` · level ${local.level}`,
          quality: null,
          aiScore: Math.round(scoreRatio * 100) / 100,
          language: lang,
        },
        select: { id: true },
      });

      let evidenceId: string | null = null;
      const skillId = await resolveSkillId(tx, lang);
      // Chỉ tạo Evidence khi đạt chuẩn nghiệm thu P3 (rating >= 3).
      if (skillId && scoreRatio >= 0.6) {
        const evidence = await tx.evidence.create({
          data: { activityId: activity.id, skillId, rating: 3 },
          select: { id: true },
        });
        evidenceId = evidence.id;
      }

      await tx.testSession.update({
        where: { id: testId },
        data: {
          status,
          score: summary.score,
          maxScore: summary.maxScore,
          durationSec,
          level: local.level,
          levelSource: "local",
          endedAt: new Date(),
          activityId: activity.id,
        },
      });

      // Placement ⇒ ghi level hồ sơ (FR-LT-07).
      if (testType === "placement") {
        await tx.userProfile.updateMany({
          data: lang === "zh" ? { zhLevel: local.level } : { enLevel: local.level },
        });
      }

      return { activityId: activity.id, evidenceId };
    });

    // ── Đẩy thẻ về ôn (FR-LT-06) — ngoài transaction vì dùng tx riêng ────
    const pushedCards = await applyFsrsAgain(
      items.map((item) => ({
        index: item.index,
        itemType: item.itemType,
        cardId: item.cardId,
        userAnswer: item.userAnswer,
        isCorrect: item.isCorrect,
        flagged: item.flagged,
      })),
    );

    return toResponse(
      ok({
        testId,
        score: summary.score,
        maxScore: summary.maxScore,
        correct: summary.correct,
        total: summary.total,
        durationSec,
        byItemType: summary.byItemType,
        wrongItems: summary.wrongItems.map((item) => ({
          index: item.index,
          itemType: item.itemType,
          prompt: item.prompt,
          userAnswer: item.userAnswer,
          answer: item.answer,
          notes: item.notes,
          flagged: item.flagged,
        })),
        pushedCards,
        activityId: evidenceResult.activityId,
        evidenceId: evidenceResult.evidenceId,
        level: local.level,
        bottleneck: local.bottleneck,
        status,
      }),
    );
  } catch (error) {
    return toResponse(
      fail("db_error", error instanceof Error ? error.message : "Không nộp được bài"),
    );
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function resolveSkillId(tx: Tx, lang: Lang): Promise<string | null> {
  const preferred = lang === "zh" ? "skill-lang-zh" : "skill-lang-en";
  const skill = await tx.skill.findFirst({
    where: { domain: "language", id: preferred },
    select: { id: true },
  });
  if (skill) return skill.id;

  const fallback = await tx.skill.findFirst({
    where: { domain: "language" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return fallback?.id ?? null;
}

function buildTitle(lang: Lang, testType: TestType, topic: string | null): string {
  const langLabel = lang === "zh" ? "Tiếng Trung" : "Tiếng Anh";
  const typeLabel: Record<TestType, string> = {
    placement: "Định vị",
    topic: "Chủ đề",
    benchmark: "Chuẩn",
    from_content: "Nội dung thực tế",
  };
  return `Bài kiểm tra ${typeLabel[testType]} — ${langLabel}${topic ? ` (${topic})` : ""}`;
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
