/**
 * Integration test — chấm điểm theo rubric (tasks.md 11.8 · AC-6 · SPEC.md §5.5).
 *
 * AC-6: *"Given* bài viết giao tiếp, *When* AI chấm, *Then* trả về **đúng 5 tiêu
 * chí** với điểm 0–5 và **tổng điểm = trung bình**; không có tiêu chí nào ngoài
 * rubric."
 *
 * Test bảo vệ 4 thứ:
 *   1. Schema chấm điểm có **đúng 5 khoá** rubric (`clarity`, `structure`,
 *      `tone`, `natural`, `grammar`) — và khoá thứ 4 là `natural`,
 *      **KHÔNG** phải `naturalness` (bug lịch sử đã gây mất điểm).
 *   2. `computeTotal` = **trung bình** 5 tiêu chí (làm tròn 1 chữ số thập phân).
 *   3. **Không có tiêu chí ngoài rubric** — payload có khoá lạ bị schema từ chối.
 *   4. Điểm ngoài thang 0–5 bị từ chối.
 *
 * ⚠️ Test này **không** gọi AI thật và **không** đụng DB — nó kiểm tra hợp
 * đồng dữ liệu (schema + quy tắc tính tổng), vốn là phần quyết định
 * "đúng 5 tiêu chí / tổng = trung bình / không tiêu chí ngoài rubric".
 * Lượt gọi AI thật được cover ở `tests/integration/cache.test.ts` (AC-5).
 *
 * Xem tasks.md 11.3 / 11.8 · SPEC.md §5.5 · AC-6 · design.md §6.6.
 */

import { describe, expect, it } from "vitest";

import {
  GRADING_CRITERION_KEYS,
  GradingSchema,
  buildGradingResult,
  buildUserPrompt,
  computeTotal,
} from "@/lib/grading-schema";
import { RUBRIC_COMMUNICATION } from "@/lib/rubrics";

// ─────────────────────────────────────────────────────────────────────────────
// Payload mẫu
// ─────────────────────────────────────────────────────────────────────────────

/** Payload hợp lệ — đúng 5 tiêu chí rubric, mỗi tiêu chí có điểm + nhận xét. */
const VALID_PAYLOAD = {
  scores: {
    clarity: 5,
    structure: 4,
    tone: 3,
    natural: 2,
    grammar: 5,
  },
  comments: {
    clarity: "Câu mở đầu nêu ngay ý chính.",
    structure: "Có mở–thân–kết rõ ràng.",
    tone: "Giọng thân thiện, hợp ngữ cảnh.",
    natural: "Có vài cụm từ dịch từng chữ.",
    grammar: "Dấu câu và cấu trúc câu đúng.",
  },
  suggestions: ["Thay 'very good' bằng 'excellent'.", "Thêm 1 ví dụ cụ thể."],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema có đúng 5 tiêu chí
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6 — schema chấm điểm có đúng 5 tiêu chí rubric", () => {
  it("schema chấm điểm có đúng 5 khoá, khớp RUBRIC_COMMUNICATION", () => {
    expect(GRADING_CRITERION_KEYS).toHaveLength(5);
    expect(RUBRIC_COMMUNICATION).toHaveLength(5);

    // Tên khoá của schema phải khớp rubric, theo **đúng thứ tự**.
    expect([...GRADING_CRITERION_KEYS]).toEqual(RUBRIC_COMMUNICATION.map((c) => c.key));
  });

  it("khoá tiêu chí đúng chính xác (tiêu chí 4 là `natural`, KHÔNG phải `naturalness`)", () => {
    expect([...GRADING_CRITERION_KEYS]).toEqual([
      "clarity",
      "structure",
      "tone",
      "natural",
      "grammar",
    ]);

    // Regression: bug lịch sử dùng `naturalness` → mất điểm tiêu chí "Tự nhiên".
    expect(GRADING_CRITERION_KEYS).not.toContain("naturalness");
    expect(RUBRIC_COMMUNICATION.map((c) => c.key)).not.toContain("naturalness");
  });

  it("payload hợp lệ parse được và có đúng 5 khoá scores + 5 khoá comments", () => {
    const parsed = GradingSchema.safeParse(VALID_PAYLOAD);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(Object.keys(parsed.data.scores)).toHaveLength(5);
    expect(Object.keys(parsed.data.comments)).toHaveLength(5);
    expect(Object.keys(parsed.data.scores).sort()).toEqual(
      [...GRADING_CRITERION_KEYS].sort(),
    );
  });

  it("thiếu 1 tiêu chí → schema từ chối (không chấm thiếu)", () => {
    const scores = { ...VALID_PAYLOAD.scores } as Record<string, number>;
    delete scores.grammar;

    const parsed = GradingSchema.safeParse({ ...VALID_PAYLOAD, scores });
    expect(parsed.success).toBe(false);
  });

  it("điểm ngoài thang 0–5 bị từ chối (mọi tiêu chí)", () => {
    for (const bad of [-1, 6, 2.5]) {
      const parsed = GradingSchema.safeParse({
        ...VALID_PAYLOAD,
        scores: { ...VALID_PAYLOAD.scores, clarity: bad },
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("mọi điểm hợp lệ trong 0–5 đều parse được", () => {
    for (const score of [0, 1, 2, 3, 4, 5]) {
      const parsed = GradingSchema.safeParse({
        ...VALID_PAYLOAD,
        scores: {
          clarity: score,
          structure: score,
          tone: score,
          natural: score,
          grammar: score,
        },
      });
      expect(parsed.success).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Không có tiêu chí ngoài rubric
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6 — không có tiêu chí ngoài rubric", () => {
  it("khoá lạ trong `scores` bị từ chối", () => {
    const parsed = GradingSchema.safeParse({
      ...VALID_PAYLOAD,
      scores: { ...VALID_PAYLOAD.scores, fluency: 4 },
    });
    expect(parsed.success).toBe(false);
  });

  it("khoá lạ trong `comments` bị từ chối", () => {
    const parsed = GradingSchema.safeParse({
      ...VALID_PAYLOAD,
      comments: { ...VALID_PAYLOAD.comments, vocabulary: "Nhận xét ngoài rubric." },
    });
    expect(parsed.success).toBe(false);
  });

  it("trường lạ ở cấp gốc bị từ chối", () => {
    const parsed = GradingSchema.safeParse({ ...VALID_PAYLOAD, confidence: 0.9 });
    expect(parsed.success).toBe(false);
  });

  it("tiêu chí của rubric khác (kỹ thuật) không lọt vào rubric giao tiếp", () => {
    const parsed = GradingSchema.safeParse({
      ...VALID_PAYLOAD,
      scores: { ...VALID_PAYLOAD.scores, accuracy: 5, tradeoff: 4 },
    });
    expect(parsed.success).toBe(false);
  });

  it("`suggestions` chỉ nhận tối đa 3 phần tử", () => {
    const tooMany = GradingSchema.safeParse({
      ...VALID_PAYLOAD,
      suggestions: ["a", "b", "c", "d"],
    });
    expect(tooMany.success).toBe(false);

    const ok = GradingSchema.safeParse({
      ...VALID_PAYLOAD,
      suggestions: ["a", "b", "c"],
    });
    expect(ok.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tổng điểm = trung bình 5 tiêu chí
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6 — tổng điểm = trung bình 5 tiêu chí", () => {
  it("tính đúng trung bình của 5 tiêu chí", () => {
    // (5 + 4 + 3 + 2 + 5) / 5 = 3.8
    expect(computeTotal(VALID_PAYLOAD.scores)).toBe(3.8);
  });

  it("mọi điểm bằng nhau → tổng = điểm đó", () => {
    for (const score of [0, 1, 2, 3, 4, 5]) {
      expect(
        computeTotal({
          clarity: score,
          structure: score,
          tone: score,
          natural: score,
          grammar: score,
        }),
      ).toBe(score);
    }
  });

  it("làm tròn 1 chữ số thập phân", () => {
    // (5 + 5 + 5 + 5 + 4) / 5 = 4.8
    expect(
      computeTotal({ clarity: 5, structure: 5, tone: 5, natural: 5, grammar: 4 }),
    ).toBe(4.8);
    // (3 + 3 + 3 + 3 + 4) / 5 = 3.2
    expect(
      computeTotal({ clarity: 3, structure: 3, tone: 3, natural: 3, grammar: 4 }),
    ).toBe(3.2);
  });

  it("khoá ngoài rubric KHÔNG được tính vào trung bình", () => {
    const withExtra = { ...VALID_PAYLOAD.scores, fluency: 5 };
    // Nếu `fluency` lọt vào trung bình thì ra 4.3 — ta phải giữ 3.8.
    expect(computeTotal(withExtra)).toBe(3.8);
  });

  it("tiêu chí thiếu điểm được coi là 0 (khớp `RubricGrid` dùng `?? 0`)", () => {
    expect(computeTotal({ clarity: 5, structure: 5 })).toBe(2);
  });

  it("`buildGradingResult` trả total = trung bình 5 tiêu chí", () => {
    const result = buildGradingResult(VALID_PAYLOAD);
    expect(result.total).toBe(3.8);
    expect(Object.keys(result.scores)).toHaveLength(5);
    expect(Object.keys(result.comments)).toHaveLength(5);
    expect(result.suggestions).toHaveLength(2);
  });

  it("`buildGradingResult` bỏ qua giá trị `total` do AI tự chế ra", () => {
    // AI được dặn KHÔNG trả `total` — nếu lỡ trả thì backend vẫn tự tính.
    const result = buildGradingResult({
      ...VALID_PAYLOAD,
      total: 99,
    } as unknown as typeof VALID_PAYLOAD);
    expect(result.total).toBe(3.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Prompt chấm điểm nhất quán với rubric
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6 — prompt chấm điểm khớp rubric", () => {
  it("prompt liệt kê đúng 5 tiêu chí của rubric", () => {
    const prompt = buildUserPrompt("write", "Đề bài", "Nội dung bài viết", "vi");
    for (const criterion of RUBRIC_COMMUNICATION) {
      expect(prompt).toContain(criterion.key);
      expect(prompt).toContain(criterion.desc);
    }
    expect(prompt).toContain("Chế độ: Viết (Tiếng Việt)");
    expect(prompt).toContain("Đề bài");
  });

  it("prompt cho mode `talk` dùng nhãn Nói", () => {
    const prompt = buildUserPrompt("talk", "Đề bài", "Transcript", "en");
    expect(prompt).toContain("Chế độ: Nói (Tiếng Anh)");
  });
});
