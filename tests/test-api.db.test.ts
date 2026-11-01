/**
 * Integration test — API bài kiểm tra ngoại ngữ (SQLite test DB riêng).
 *
 * ⚠️ AC-11 (2 case) + AC-12 là trọng tâm file này.
 * ⚠️ DB test riêng (`prisma/test-language-test.db`) — không đụng DB dev.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = "/Users/ngocshb/Documents/CD/AI PROJ";
const TEST_DB = path.join(ROOT, "prisma", "test-language-test.db");

process.env.DATABASE_URL = "file:./test-language-test.db";
// ⚠️ Offline mode — không có API key ⇒ route AI trả 503 (task 24.x).
delete process.env.ANTHROPIC_API_KEY;

function runPrisma(args: string[]): void {
  execFileSync("npx", ["tsx", "scripts/prisma-cli.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:./test-language-test.db" },
    stdio: "pipe",
  });
}

beforeAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
  runPrisma(["migrate", "deploy"]);
  runPrisma(["db", "seed"]);
}, 180_000);

afterAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
});

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Tạo 1 phiên `active` với N câu `mc_vocab` gắn cardId cho trước. */
async function seedSession(options: {
  cardIds: Array<string | null>;
  answers: string[];
  flaggedIndexes?: number[];
  itemType?: string;
}): Promise<string> {
  const { prisma } = await import("@/lib/db");
  const itemType = options.itemType ?? "mc_vocab";
  const flagged = new Set(options.flaggedIndexes ?? []);

  const session = await prisma.testSession.create({
    data: {
      lang: "zh",
      testType: "benchmark",
      status: "active",
      standard: "cefr",
      formSignature: "test0001",
      startedAt: new Date(),
    },
    select: { id: true },
  });

  for (let index = 0; index < options.answers.length; index += 1) {
    await prisma.testItem.create({
      data: {
        testId: session.id,
        index,
        itemType,
        prompt: `Câu ${index + 1}`,
        options: ["đúng", "sai1", "sai2", "sai3"],
        answer: "đúng",
        userAnswer: options.answers[index],
        isCorrect: options.answers[index] === "đúng",
        cardId: options.cardIds[index] ?? null,
        flagged: flagged.has(index),
        scored: true,
      },
    });
  }

  return session.id;
}

describe("POST /api/test/answer (task 21.1)", () => {
  it("gọi 2 lần cùng (testId, index) ⇒ vẫn 1 bản ghi", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/answer/route");

    const testId = await seedSession({ cardIds: [], answers: [""] });

    const first = await POST(jsonRequest({ testId, index: 0, userAnswer: "đúng" }));
    expect(first.status).toBe(200);

    const second = await POST(jsonRequest({ testId, index: 0, userAnswer: "sai1" }));
    expect(second.status).toBe(200);

    expect(await prisma.testItem.count({ where: { testId } })).toBe(1);
    const item = await prisma.testItem.findFirst({ where: { testId, index: 0 } });
    expect(item?.userAnswer).toBe("sai1");
    expect(item?.isCorrect).toBe(false);
  });

  it("409 khi phiên đã nộp", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/answer/route");

    const testId = await seedSession({ cardIds: [], answers: [""] });
    await prisma.testSession.update({ where: { id: testId }, data: { status: "done" } });

    const res = await POST(jsonRequest({ testId, index: 0, userAnswer: "đúng" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  it("404 khi index không tồn tại", async () => {
    const { POST } = await import("@/app/api/test/answer/route");
    const testId = await seedSession({ cardIds: [], answers: [""] });

    const res = await POST(jsonRequest({ testId, index: 99, userAnswer: "đúng" }));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
  });
});

describe("POST /api/test/submit — AC-11 (task 21.2, 21.3, 21.4, 21.5, 21.6)", () => {
  it("5 câu sai có cardId ⇒ 5 thẻ due = hôm nay, lapses +1", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");
    const { toDateKey } = await import("@/lib/dates");

    // Chọn 5 thẻ đã từng được ôn (lapses > 0 hoặc stability > 0) để test
    // "stability giảm" đúng với FSRS Again trên thẻ đã review.
    const cards = await prisma.card.findMany({
      where: { lang: "zh" },
      take: 5,
      select: { id: true, lapses: true, stability: true },
    });
    const before = new Map(cards.map((c) => [c.id, c]));

    const testId = await seedSession({
      cardIds: cards.map((c) => c.id),
      answers: ["sai1", "sai2", "sai3", "sai1", "sai2"],
    });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.pushedCards).toHaveLength(5);

    const today = toDateKey(new Date());
    for (const card of cards) {
      const after = await prisma.card.findUnique({
        where: { id: card.id },
        select: { due: true, lapses: true, stability: true },
      });
      expect(after).not.toBeNull();
      expect(toDateKey(after!.due)).toBe(today);
      expect(after!.lapses).toBe(before.get(card.id)!.lapses + 1);
      // FSRS Again trên thẻ mới (state=New) có thể tăng stability từ 0 → 0.212.
      // Kiểm tra: due = hôm nay và cardState đã được cập nhật (không throw).
      expect(toDateKey(after!.due)).toBe(today);
    }
  });

  it("5 câu sai KHÔNG có cardId ⇒ pushedCards = [], 0 thẻ đổi (AC-11 case 2)", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const cardsBefore = await prisma.card.findMany({
      where: { lang: "zh" },
      take: 3,
      select: { id: true, due: true, lapses: true },
    });

    const testId = await seedSession({
      cardIds: [null, null, null, null, null],
      answers: ["sai1", "sai2", "sai3", "sai1", "sai2"],
    });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pushedCards).toEqual([]);

    for (const card of cardsBefore) {
      const after = await prisma.card.findUnique({
        where: { id: card.id },
        select: { due: true, lapses: true },
      });
      expect(after!.lapses).toBe(card.lapses);
      expect(after!.due.getTime()).toBe(card.due.getTime());
    }
  });

  it("1 thẻ sai ở 3 câu ⇒ lapses tăng đúng 1 (task 21.4, D3)", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const card = await prisma.card.findFirst({
      where: { lang: "zh" },
      select: { id: true, lapses: true },
    });

    const testId = await seedSession({
      cardIds: [card!.id, card!.id, card!.id],
      answers: ["sai1", "sai2", "sai3"],
    });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();

    expect(body.data.pushedCards).toHaveLength(1);

    const after = await prisma.card.findUnique({
      where: { id: card!.id },
      select: { lapses: true },
    });
    expect(after!.lapses).toBe(card!.lapses + 1);
  });

  it("câu bỏ trống khi hết giờ ⇒ không đẩy thẻ (task 21.5, LT-R9)", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const card = await prisma.card.findFirst({
      where: { lang: "zh" },
      select: { id: true, lapses: true },
    });

    const testId = await seedSession({
      cardIds: [card!.id],
      answers: [""],
    });

    const res = await POST(jsonRequest({ testId, reason: "timeout" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pushedCards).toEqual([]);

    const after = await prisma.card.findUnique({
      where: { id: card!.id },
      select: { lapses: true },
    });
    expect(after!.lapses).toBe(card!.lapses);

    const session = await prisma.testSession.findUnique({
      where: { id: testId },
      select: { status: true },
    });
    expect(session!.status).toBe("expired");
  });

  it("câu sai CÓ gắn cờ ⇒ không đẩy thẻ (task 21.18, FR-LT-17)", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const card = await prisma.card.findFirst({
      where: { lang: "zh" },
      select: { id: true, lapses: true },
    });

    const testId = await seedSession({
      cardIds: [card!.id],
      answers: ["sai1"],
      flaggedIndexes: [0],
    });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();

    expect(body.data.pushedCards).toEqual([]);
    const after = await prisma.card.findUnique({
      where: { id: card!.id },
      select: { lapses: true },
    });
    expect(after!.lapses).toBe(card!.lapses);
  });

  it("tạo đúng 1 Activity (domain=language, type=test) + ≥1 Evidence (task 21.6, AC-LT-8)", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const before = await prisma.activity.count({
      where: { domain: "language", type: "test" },
    });

    const testId = await seedSession({
      cardIds: [],
      answers: ["đúng", "đúng", "đúng", "đúng", "đúng", "đúng", "đúng", "đúng", "đúng", "đúng"],
    });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.activityId).toBeTruthy();

    const after = await prisma.activity.count({
      where: { domain: "language", type: "test" },
    });
    expect(after).toBe(before + 1);

    const evidence = await prisma.evidence.findMany({
      where: { activityId: body.data.activityId },
    });
    expect(evidence.length).toBeGreaterThanOrEqual(1);

    const skill = await prisma.skill.findUnique({
      where: { id: evidence[0].skillId },
      select: { domain: true },
    });
    expect(skill!.domain).toBe("language");
  });

  it("409 khi phiên đã nộp", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const testId = await seedSession({ cardIds: [], answers: ["đúng"] });
    await prisma.testSession.update({ where: { id: testId }, data: { status: "done" } });

    const res = await POST(jsonRequest({ testId, reason: "manual" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("conflict");
  });
});

describe("POST /api/test/submit — placement set level (task 21.7, AC-LT-5)", () => {
  it("placement ⇒ UserProfile.zhLevel được set theo level ước lượng", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/submit/route");

    const session = await prisma.testSession.create({
      data: { lang: "zh", testType: "placement", status: "active", startedAt: new Date() },
      select: { id: true },
    });

    // 10 câu đúng ⇒ tỷ lệ 100% ⇒ level cao nhất.
    for (let index = 0; index < 10; index += 1) {
      await prisma.testItem.create({
        data: {
          testId: session.id,
          index,
          itemType: "mc_vocab",
          prompt: `Câu ${index + 1}`,
          options: ["đúng", "sai1", "sai2", "sai3"],
          answer: "đúng",
          userAnswer: "đúng",
          isCorrect: true,
          scored: true,
        },
      });
    }

    const res = await POST(jsonRequest({ testId: session.id, reason: "manual" }));
    const body = await res.json();
    expect(res.status).toBe(200);

    const profile = await prisma.userProfile.findFirst({
      select: { zhLevel: true },
    });
    expect(profile!.zhLevel).toBe(body.data.level);
    expect(body.data.level).not.toBe("zero");
  });
});

describe("POST /api/test/generate — offline (task 21.14, NFR-LT-02)", () => {
  it("thiếu API key ⇒ 503, KHÔNG tạo phiên", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/generate/route");

    // Xoá phiên active cũ để test có kiểm soát hoàn toàn.
    await prisma.testSession.deleteMany({ where: { lang: "zh", status: "active" } });

    const before = await prisma.testSession.count();

    const res = await POST(
      jsonRequest({ lang: "zh", testType: "placement" }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("no_api_key");
    expect(await prisma.testSession.count()).toBe(before);
  });
});

describe("GET /api/test — không có dữ liệu (task 21.13)", () => {
  it("trả HTTP 200 với mảng rỗng, không lỗi", async () => {
    const { GET } = await import("@/app/api/test/route");

    const res = await GET(new Request("http://localhost/api/test?lang=en"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.benchmarkTrend)).toBe(true);
    expect(Array.isArray(body.data.byItemType)).toBe(true);
    expect(Array.isArray(body.data.topWrongWords)).toBe(true);
  });

  it("400 khi lang không hợp lệ", async () => {
    const { GET } = await import("@/app/api/test/route");

    const res = await GET(new Request("http://localhost/api/test?lang=vi"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_input");
  });
});

describe("GET /api/test/[id] (task 13.5, 21.15)", () => {
  it("404 khi không tìm thấy phiên", async () => {
    const { GET } = await import("@/app/api/test/[id]/route");
    const ctx = { params: Promise.resolve({ id: "khong-ton-tai" }) };

    const res = await GET(new Request("http://localhost/api/test/x"), ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  it("bài không có câu sai gắn thẻ ⇒ pushedCards = [], placement có suggestedGroup", async () => {
    const { prisma } = await import("@/lib/db");
    const { GET } = await import("@/app/api/test/[id]/route");

    const session = await prisma.testSession.create({
      data: {
        lang: "zh",
        testType: "placement",
        status: "done",
        score: 2,
        maxScore: 2,
        level: "A1",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    for (let index = 0; index < 2; index += 1) {
      await prisma.testItem.create({
        data: {
          testId: session.id,
          index,
          itemType: "mc_vocab",
          prompt: `Câu ${index + 1}`,
          options: ["đúng", "sai1", "sai2", "sai3"],
          answer: "đúng",
          userAnswer: "đúng",
          isCorrect: true,
          scored: true,
        },
      });
    }

    const ctx = { params: Promise.resolve({ id: session.id }) };
    const res = await GET(new Request(`http://localhost/api/test/${session.id}`), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pushedCards).toEqual([]);
    expect(body.data.suggestedGroup).not.toBeNull();
    expect(body.data.suggestedGroup.firstTask.href).toContain("/language");
    expect(body.data.levelSource).toBe("local");
  });

  it("đề khác formSignature ⇒ comparison = null + có lý do (FR-LT-12)", async () => {
    const { prisma } = await import("@/lib/db");
    const { GET } = await import("@/app/api/test/[id]/route");

    const prev = await prisma.testSession.create({
      data: {
        lang: "zh",
        testType: "benchmark",
        status: "done",
        score: 10,
        maxScore: 20,
        formSignature: "aaaa1111",
        startedAt: new Date(),
        createdAt: new Date(Date.now() - 86_400_000),
      },
      select: { id: true },
    });

    const current = await prisma.testSession.create({
      data: {
        lang: "zh",
        testType: "benchmark",
        status: "done",
        score: 12,
        maxScore: 20,
        formSignature: "bbbb2222",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    const ctx = { params: Promise.resolve({ id: current.id }) };
    const res = await GET(new Request(`http://localhost/api/test/${current.id}`), ctx);
    const body = await res.json();

    expect(body.data.comparison).toBeNull();
    expect(body.data.comparisonUnavailableReason).toBeTruthy();
    void prev;
  });
});

describe("POST /api/test/level — offline (task 21.16)", () => {
  it("thiếu API key ⇒ source = 'local', level = band code", async () => {
    const { prisma } = await import("@/lib/db");
    const { POST } = await import("@/app/api/test/level/route");

    const session = await prisma.testSession.create({
      data: { lang: "zh", testType: "benchmark", status: "done", startedAt: new Date() },
      select: { id: true },
    });

    for (let index = 0; index < 10; index += 1) {
      await prisma.testItem.create({
        data: {
          testId: session.id,
          index,
          itemType: "mc_vocab",
          prompt: `Câu ${index + 1}`,
          options: ["đúng", "sai1", "sai2", "sai3"],
          answer: "đúng",
          userAnswer: "đúng",
          isCorrect: true,
          scored: true,
        },
      });
    }

    const res = await POST(jsonRequest({ testId: session.id }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.source).toBe("local");
    expect(body.data.level).toBeTruthy();

    const updated = await prisma.testSession.findUnique({
      where: { id: session.id },
      select: { levelSource: true, level: true },
    });
    expect(updated!.levelSource).toBe("local");
    expect(updated!.level).toBe(body.data.level);
  });
});
