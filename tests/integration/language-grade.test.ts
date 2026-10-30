/**
 * Integration test — chấm câu tự luận theo 4 nhóm lỗi (tasks.md 14.21 · AC-12).
 *
 * AC-12: *"Câu tự luận: lỗi thuộc đúng 1 trong 4 nhóm"*
 * (design.md §6.8): mỗi lỗi AI phát hiện phải thuộc **đúng 1** nhóm trong
 * `RUBRIC_LANGUAGE_ERRORS` — `grammar` · `vocab` · `expression` · `context`.
 *
 * Test bảo vệ 4 thứ:
 *   1. `normalizeErrorGroups` **luôn** trả về đúng 4 khoá, không hơn không kém.
 *   2. Mỗi lỗi nằm trong **đúng 1** nhóm — không lỗi nào bị gán 2 nhóm,
 *      không nhóm nào chứa lỗi của nhóm khác.
 *   3. Nhóm lạ do AI trả về (`spelling`, `syntax`, `style`…) được **gộp** vào
 *      nhóm gần nghĩa nhất — không tạo nhóm thứ 5.
 *   4. Endpoint thật `/api/test/grade-open` với dạng `writing`/`translation`:
 *      lỗi lưu xuống DB vẫn nằm trong 4 nhóm.
 *
 * ⚠️ Test **không** gọi AI thật — `callAi` được mock trả payload cố định.
 *
 * Xem tasks.md 14.11 / 14.21 · design.md §4.19 / §6.6 / §6.8 · AC-12.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callAi: vi.fn(),
}));

vi.mock("@/lib/ai/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/router")>();
  return { ...actual, callAi: mocks.callAi };
});

import { prisma } from "@/lib/db";
import { ERROR_GROUP_KEYS, normalizeErrorGroups } from "@/lib/test-gen";
import {
  RUBRIC_LANGUAGE_ERRORS,
  RUBRIC_LANGUAGE_ERROR_CONSTANTS,
  RUBRIC_LANGUAGE_ERROR_KEYS,
} from "@/lib/rubrics";
import { POST as gradeOpen } from "@/app/api/test/grade-open/route";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TEST_IDS = {
  testSession: "test-session-14-ai",
  testItems: ["test-item-14-ai-0", "test-item-14-ai-1"],
} as const;

/** 4 nhóm hợp lệ — nguồn sự thật duy nhất. */
const VALID_KEYS = ["grammar", "vocab", "expression", "context"] as const;

/** Payload AI trả về — mỗi nhóm 1 lỗi, cộng thêm 2 nhóm lạ. */
const AI_ERRORS = {
  grammar: [{ original: "我每天学习中文", correction: "我每天都学习中文。", explanation: "Thiếu '都'." }],
  vocab: [{ original: "我想喝咖啡", correction: "我想喝咖啡。", explanation: "Sai từ." }],
  expression: [{ original: "你好", correction: "您好。", explanation: "Cách diễn đạt." }],
  context: [{ original: "吃饭了吗", correction: "吃了吗？", explanation: "Ngữ cảnh." }],
  // 2 nhóm LẠ — phải được gộp, không tạo nhóm thứ 5.
  spelling: [{ original: "xiezi", correction: "鞋子", explanation: "Chính tả." }],
  style: [{ original: "很好", correction: "非常好。", explanation: "Văn phong." }],
};

/** Dọn dẹp mọi bản ghi test. */
async function cleanup(): Promise<void> {
  await prisma.testItem.deleteMany({ where: { testId: TEST_IDS.testSession } });
  await prisma.testSession.deleteMany({ where: { id: TEST_IDS.testSession } });
}

/** Body gọi `/api/test/grade-open`. */
function gradeBody(testId: string, answers: Array<{ index: number; userAnswer: string }>): Request {
  return new Request("http://localhost/api/test/grade-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testId, answers }),
  });
}

/** Tạo 1 phiên gồm 1 câu writing + 1 câu translation. */
async function seedSession(): Promise<void> {
  await prisma.testSession.create({
    data: {
      id: TEST_IDS.testSession,
      lang: "zh",
      testType: "placement",
      level: "zero",
      blueprint: { itemTypes: ["writing", "translation"], count: 2 },
      items: {
        create: [
          {
            id: TEST_IDS.testItems[0],
            index: 0,
            itemType: "writing",
            prompt: "Viết 3 câu giới thiệu bản thân bằng tiếng Trung.",
            answer: "",
            cardId: null,
          },
          {
            id: TEST_IDS.testItems[1],
            index: 1,
            itemType: "translation",
            prompt: "Dịch sang tiếng Trung.",
            answer: "我在一家软件公司工作。",
            cardId: null,
          },
        ],
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Luôn đúng 4 nhóm
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-12 — luôn đúng 4 nhóm lỗi", () => {
  it("rubric có đúng 4 nhóm, đúng tên khoá", () => {
    expect(RUBRIC_LANGUAGE_ERRORS).toHaveLength(4);
    expect([...RUBRIC_LANGUAGE_ERROR_KEYS]).toEqual([...VALID_KEYS]);
    expect([...ERROR_GROUP_KEYS]).toEqual([...VALID_KEYS]);
  });

  it("mỗi nhóm có hằng số SCREAMING_SNAKE_CASE riêng", () => {
    expect([...RUBRIC_LANGUAGE_ERROR_CONSTANTS]).toEqual([
      "GRAMMAR",
      "VOCAB",
      "EXPRESSION",
      "CONTEXT",
    ]);
    // Hằng số phải là duy nhất.
    expect(new Set(RUBRIC_LANGUAGE_ERROR_CONSTANTS).size).toBe(4);
  });

  it("normalizeErrorGroups luôn trả về đúng 4 khoá (kể cả input rỗng/lạ)", () => {
    const inputs: unknown[] = [
      {},
      null,
      undefined,
      "không phải object",
      42,
      [],
      { grammar: [] },
      AI_ERRORS,
    ];

    for (const input of inputs) {
      const out = normalizeErrorGroups(input);
      expect(Object.keys(out).sort()).toEqual([...VALID_KEYS].sort());
      for (const key of VALID_KEYS) {
        expect(Array.isArray(out[key])).toBe(true);
      }
    }
  });

  it("không nhóm nào ngoài 4 nhóm hợp lệ", () => {
    const out = normalizeErrorGroups(AI_ERRORS);
    for (const key of Object.keys(out)) {
      expect(VALID_KEYS).toContain(key);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mỗi lỗi thuộc đúng 1 nhóm
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-12 — mỗi lỗi thuộc đúng 1 nhóm", () => {
  it("1 lỗi vào đúng 1 nhóm — không lặp, không mất", () => {
    const out = normalizeErrorGroups({
      grammar: [{ original: "A", correction: "B", explanation: "C" }],
    });

    // Đúng 1 nhóm có lỗi.
    const nonEmpty = VALID_KEYS.filter((k) => (out[k] ?? []).length > 0);
    expect(nonEmpty).toEqual(["grammar"]);

    // Tổng số lỗi = 1.
    const total = Object.values(out).reduce((sum, errs) => sum + errs.length, 0);
    expect(total).toBe(1);
  });

  it("lỗi của nhóm khác KHÔNG bị lẫn sang nhóm này", () => {
    const out = normalizeErrorGroups(AI_ERRORS);

    // Mỗi nhóm hợp lệ chỉ chứa lỗi `original` của chính nó — cộng thêm lỗi
    // từ nhóm lạ được gộp vào (`spelling` → vocab).
    expect(out.grammar?.map((e) => e.original)).toEqual(["我每天学习中文"]);
    expect(out.vocab?.map((e) => e.original)).toEqual(["我想喝咖啡", "xiezi"]);
    expect(out.expression?.map((e) => e.original)).toEqual(["你好", "很好"]);
    expect(out.context?.map((e) => e.original)).toEqual(["吃饭了吗"]);

    // Tổng số lỗi = 4 (nhóm hợp lệ) + 2 (nhóm lạ được gộp) = 6.
    const total = Object.values(out).reduce((sum, errs) => sum + errs.length, 0);
    expect(total).toBe(6);
  });

  it("mỗi lỗi xuất hiện đúng 1 lần trong toàn bộ 4 nhóm", () => {
    const out = normalizeErrorGroups(AI_ERRORS);
    const all = Object.values(out).flat().map((e) => e.original);
    expect(all).toHaveLength(new Set(all).size);
  });

  it("lỗi thiếu `original` bị loại (không tạo lỗi rỗng)", () => {
    const out = normalizeErrorGroups({
      grammar: [
        { correction: "B", explanation: "C" }, // thiếu original
        { original: "", correction: "B", explanation: "C" }, // original rỗng
        { original: "A", correction: "B", explanation: "C" }, // hợp lệ
      ],
    });

    expect(out.grammar).toHaveLength(1);
    expect(out.grammar?.[0]?.original).toBe("A");
  });

  it("mục không phải object hoặc list không phải array bị bỏ qua", () => {
    const out = normalizeErrorGroups({
      grammar: "không phải array",
      vocab: [null, "chuỗi", 42, { original: "A", correction: "B", explanation: "C" }],
    });

    expect(out.grammar).toEqual([]);
    expect(out.vocab).toHaveLength(1);
    expect(out.vocab?.[0]?.original).toBe("A");
  });

  it("thiếu `correction`/`explanation` vẫn giữ lỗi với chuỗi rỗng", () => {
    const out = normalizeErrorGroups({
      grammar: [{ original: "A" }],
    });

    expect(out.grammar).toHaveLength(1);
    expect(out.grammar?.[0]).toEqual({ original: "A", correction: "", explanation: "" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Nhóm lạ được gộp vào nhóm gần nghĩa nhất
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-12 — nhóm lạ được gộp, không tạo nhóm thứ 5", () => {
  it("`spelling` → vocab, `syntax` → grammar, `style` → expression", () => {
    const out = normalizeErrorGroups({
      spelling: [{ original: "A", correction: "B", explanation: "C" }],
      syntax: [{ original: "D", correction: "E", explanation: "F" }],
      style: [{ original: "G", correction: "H", explanation: "I" }],
    });

    expect(out.vocab?.map((e) => e.original)).toEqual(["A"]);
    expect(out.grammar?.map((e) => e.original)).toEqual(["D"]);
    expect(out.expression?.map((e) => e.original)).toEqual(["G"]);
    // Nhóm lạ không sinh khoá mới.
    expect(Object.keys(out).sort()).toEqual([...VALID_KEYS].sort());
  });

  it("nhóm lạ không nhận diện được → context (nhóm mặc định)", () => {
    const out = normalizeErrorGroups({
      "một-nhóm-rất-lạ": [{ original: "A", correction: "B", explanation: "C" }],
    });

    expect(out.context?.map((e) => e.original)).toEqual(["A"]);
    expect(Object.keys(out).sort()).toEqual([...VALID_KEYS].sort());
  });

  it("nhóm lạ gộp vào nhóm hợp lệ đã có lỗi → vẫn 1 nhóm, lỗi gộp chung", () => {
    const out = normalizeErrorGroups({
      grammar: [{ original: "A", correction: "B", explanation: "C" }],
      syntax: [{ original: "D", correction: "E", explanation: "F" }],
    });

    expect(out.grammar?.map((e) => e.original)).toEqual(["A", "D"]);
    expect(Object.keys(out).sort()).toEqual([...VALID_KEYS].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Endpoint thật — lỗi lưu xuống DB vẫn nằm trong 4 nhóm
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-12 — endpoint chấm bài tự luận", () => {
  beforeEach(async () => {
    await cleanup();
    mocks.callAi.mockReset();
    mocks.callAi.mockResolvedValue({
      ok: true,
      data: { score: 7, errors: AI_ERRORS },
    });
  });

  afterEach(cleanup);
  afterAll(cleanup);

  it("writing/translation → errorGroups lưu xuống DB nằm trong đúng 4 nhóm", async () => {
    await seedSession();

    const res = await gradeOpen(
      gradeBody(TEST_IDS.testSession, [
        { index: 0, userAnswer: "我每天学习中文" },
        { index: 1, userAnswer: "我在一家软件公司工作。" },
      ]),
    );
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      ok: boolean;
      data: {
        items: Array<{
          index: number;
          itemType: string;
          score: number;
          isCorrect: boolean | null;
          errorGroups: Record<string, Array<{ original: string }>>;
        }>;
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.items).toHaveLength(2);

    for (const item of payload.data.items) {
      // 4 nhóm, không hơn không kém.
      expect(Object.keys(item.errorGroups).sort()).toEqual([...VALID_KEYS].sort());
      // Mỗi lỗi thuộc đúng 1 nhóm.
      const all = Object.values(item.errorGroups).flat().map((e) => e.original);
      expect(all).toHaveLength(new Set(all).size);
      // Câu tự luận không có đúng/sai nhị phân.
      expect(item.isCorrect).toBeNull();
      // Điểm AI trong thang 0..10.
      expect(item.score).toBe(7);
    }
  });

  it("AI lỗi → fallback về 0 điểm, không có nhóm lọt", async () => {
    await seedSession();
    mocks.callAi.mockResolvedValue({
      ok: false,
      error: { code: "unavailable", message: "AI không khả dụng" },
    });

    const res = await gradeOpen(
      gradeBody(TEST_IDS.testSession, [{ index: 0, userAnswer: "我每天学习中文" }]),
    );
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      ok: boolean;
      data: { items: Array<{ score: number; errorGroups: Record<string, unknown> }> };
    };

    expect(payload.data.items[0]?.score).toBe(0);
    expect(Object.keys(payload.data.items[0]?.errorGroups ?? {})).toHaveLength(0);
  });

  it("errorGroups lưu trong DB khớp với payload trả về", async () => {
    await seedSession();

    await gradeOpen(
      gradeBody(TEST_IDS.testSession, [{ index: 0, userAnswer: "我每天学习中文" }]),
    );

    const item = await prisma.testItem.findUnique({ where: { id: TEST_IDS.testItems[0] } });
    expect(item).not.toBeNull();

    const stored = item?.errorGroups as Record<string, Array<{ original: string }>>;
    expect(Object.keys(stored).sort()).toEqual([...VALID_KEYS].sort());

    const all = Object.values(stored).flat().map((e) => e.original);
    expect(all).toHaveLength(new Set(all).size);
    expect(all.length).toBe(6); // 4 nhóm hợp lệ + 2 nhóm lạ được gộp.
  });
});
