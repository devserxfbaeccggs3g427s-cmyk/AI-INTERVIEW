import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { AiError, isAiAvailable } from "@/lib/anthropic";
import { prisma } from "@/lib/db";
import { generateTestItems } from "@/lib/test-ai";
import {
  buildBlueprint,
  TEST_COUNTS,
  TEST_ITEM_DISTRIBUTION,
  type ItemType,
  type Lang,
  type LevelCode,
  type TestType,
} from "@/lib/test";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GenerateTestSchema = z.object({
  lang: z.enum(["zh", "en"]),
  testType: z.enum(["placement", "topic", "benchmark", "from_content"]),
  topic: z.string().min(1).max(80).nullable().optional(),
  level: z.enum(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  itemTypes: z.array(z.string()).optional(),
  count: z.number().int().min(1).max(40).optional(),
  sourceText: z.string().max(8_000).nullable().optional(),
  standard: z.enum(["cefr", "hsk", "vendor"]).optional(),
});

/** Giới hạn văn bản `from_content` — 8.000 ký tự (spec §6.6). */
const SOURCE_TEXT_MAX = 8_000;

/**
 * POST /api/test/generate — AI-14: dựng blueprint + sinh câu hỏi + ghi DB.
 *
 * ⚠️ Offline (thiếu API key) ⇒ `503`, **không** tạo phiên rỗng.
 * ⚠️ AI lỗi ⇒ **không** tạo phiên rỗng trong DB.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = GenerateTestSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")),
    );
  }

  const input = parsed.data;
  const lang = input.lang as Lang;
  const testType = input.testType as TestType;

  // ── Validate theo từng loại đề ──────────────────────────────────────────
  let sourceText: string | null = null;
  if (testType === "from_content") {
    const raw = (input.sourceText ?? "").trim();
    if (!raw) {
      return toResponse(fail("invalid_input", "from_content cần văn bản nguồn"));
    }
    sourceText = raw.slice(0, SOURCE_TEXT_MAX);
  }

  if (testType === "topic" && !input.topic) {
    return toResponse(fail("invalid_input", "Đề theo chủ đề cần `topic`"));
  }

  // ── Chặn khi đã có phiên `active` cùng lang (409) ───────────────────────
  const active = await prisma.testSession.findFirst({
    where: { lang, status: "active" },
    select: { id: true },
  });
  if (active) {
    return Response.json(
      {
        ok: false,
        error: "conflict",
        message: "Đang có một bài kiểm tra chưa nộp cho ngôn ngữ này",
        data: { testId: active.id },
      },
      { status: 409 },
    );
  }

  // ── Offline: 503, không tạo phiên ───────────────────────────────────────
  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Bật sinh đề AI bằng cách thêm API key trong Cài đặt"),
    );
  }

  const itemTypes = resolveItemTypes(testType, input.itemTypes);
  const count = input.count ?? TEST_COUNTS[testType];

  // Level đích: theo hồ sơ nếu không chỉ định.
  const level = (input.level ?? (await loadProfileLevel(lang))) as LevelCode;
  const standard = input.standard ?? (lang === "zh" ? "hsk" : "cefr");

  try {
    const blueprint = await buildBlueprint({
      lang,
      testType,
      topic: input.topic ?? null,
      level,
      count,
      itemTypes,
      standard,
      sourceText,
    });

    // Nạp chi tiết thẻ để đưa cho AI (chỉ sinh cách hỏi, không sinh từ mới).
    const cards = await prisma.card.findMany({
      where: { id: { in: blueprint.cardIds } },
      select: { id: true, front: true, frontAlt: true, back: true, lapses: true, difficulty: true, stability: true },
    });
    const bandOf = new Map(
      blueprint.cardIds.map((id, index) => {
        const card = cards.find((c) => c.id === id);
        const band =
          card && (card.lapses >= 2 || card.difficulty >= 7)
            ? 3
            : card && (card.lapses >= 1 || card.stability < 5)
              ? 2
              : 1;
        void index;
        return [id, band] as const;
      }),
    );

    const generated = await generateTestItems({
      lang,
      level,
      topic: input.topic ?? null,
      itemTypes,
      count,
      cards: cards.map((card) => ({
        cardId: card.id,
        front: card.front,
        frontAlt: card.frontAlt,
        back: card.back,
        band: bandOf.get(card.id) ?? 1,
      })),
      sourceText,
    });

    const items = generated.items;

    // ── Ghi TestSession + TestItem trong 1 transaction ────────────────────
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.testSession.create({
        data: {
          lang,
          testType,
          topic: input.topic ?? null,
          level: null,
          status: "active",
          standard,
          formSignature: blueprint.formSignature,
          sourceText,
          startedAt: new Date(),
          blueprint: blueprint as unknown as object,
        },
        select: { id: true },
      });

      if (items.length > 0) {
        await tx.testItem.createMany({
          data: items.map((item, index) => ({
            testId: session.id,
            index,
            itemType: item.itemType,
            prompt: item.prompt,
            audioText: item.audioText,
            options: item.options as unknown as object,
            answer: item.answer,
            cardId: item.cardId,
            skillName: item.skillName,
            scored: !isOpenType(item.itemType),
          })),
        });
      }

      return session;
    });

    return toResponse(
      ok({
        testId: created.id,
        count: items.length,
        blueprint,
        formSignature: blueprint.formSignature,
        warnings: generated.warnings,
        items: items.map((item, index) => ({ index, ...item })),
      }),
    );
  } catch (error) {
    if (error instanceof AiError) {
      return toResponse(fail("ai_error", error.userMessage));
    }
    return toResponse(
      fail("unknown", error instanceof Error ? error.message : "Không tạo được đề"),
    );
  }
}

function isOpenType(itemType: ItemType): boolean {
  return itemType === "writing" || itemType === "translation";
}

/**
 * Phân bổ dạng câu — người dùng có thể đổi tỉ lệ nhưng **tổng số câu không đổi**.
 */
function resolveItemTypes(testType: TestType, requested?: string[]): ItemType[] {
  const base = TEST_ITEM_DISTRIBUTION[testType];
  if (!requested || requested.length === 0) return base;

  const valid = requested.filter((type): type is ItemType =>
    [
      "mc_vocab",
      "mc_grammar",
      "cloze",
      "listening",
      "writing",
      "translation",
    ].includes(type),
  );
  if (valid.length === 0) return base;

  // Cắt/thêm để giữ đúng tổng số câu của loại đề.
  const target = base.length;
  const result = valid.slice(0, target);
  while (result.length < target) {
    result.push(base[result.length % base.length]);
  }
  return result;
}

async function loadProfileLevel(lang: Lang): Promise<LevelCode> {
  const profile = await prisma.userProfile.findFirst({
    select: { zhLevel: true, enLevel: true },
  });
  const raw = lang === "zh" ? profile?.zhLevel : profile?.enLevel;
  const levels: LevelCode[] = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"];
  return levels.includes(raw as LevelCode) ? (raw as LevelCode) : "zero";
}
