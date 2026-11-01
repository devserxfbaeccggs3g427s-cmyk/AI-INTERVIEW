import { describe, expect, it } from "vitest";

import {
  averageRubric,
  gradeLocally,
  normalizeErrorGroups,
  normalizeRubric,
  RUBRIC_CRITERIA,
} from "@/lib/speak";

describe("rubric có đúng 5 tiêu chí (AC-CM-1)", () => {
  it("5 tiêu chí", () => {
    expect(RUBRIC_CRITERIA).toHaveLength(5);
    expect([...RUBRIC_CRITERIA]).toEqual([
      "clarity",
      "structure",
      "tone",
      "naturalness",
      "grammar",
    ]);
  });
});

describe("tổng điểm = trung bình 5 tiêu chí (AC-CM-2, NFR-CM-06)", () => {
  it("mọi tiêu chí = 4 ⇒ tổng = 4", () => {
    expect(
      averageRubric({
        clarity: 4,
        structure: 4,
        tone: 4,
        naturalness: 4,
        grammar: 4,
      }),
    ).toBe(4);
  });

  it("điểm lệch nhau ⇒ trung bình, không phải max", () => {
    const score = averageRubric({
      clarity: 5,
      structure: 2,
      tone: 3,
      grammar: 2,
      naturalness: 3,
    });

    // (5+2+3+2+3)/5 = 3
    expect(score).toBe(3);
    expect(score).not.toBe(5);
  });

  it("làm tròn 1 chữ số thập phân", () => {
    const score = averageRubric({
      clarity: 3.33,
      structure: 3.33,
      tone: 3.33,
      naturalness: 3.33,
      grammar: 3.33,
    });

    expect(score).toBe(3.3);
  });
});

describe("chuẩn hoá rubric từ AI", () => {
  it("thiếu tiêu chí ⇒ điểm 0, không NaN", () => {
    const rubric = normalizeRubric({ clarity: 4 });

    expect(rubric.clarity).toBe(4);
    expect(rubric.structure).toBe(0);
    expect(Number.isNaN(rubric.grammar)).toBe(false);
  });

  it("ép điểm trong 0..5", () => {
    const rubric = normalizeRubric({
      clarity: 99,
      structure: -5,
      tone: 3,
      naturalness: 3,
      grammar: 3,
    });

    expect(rubric.clarity).toBe(5);
    expect(rubric.structure).toBe(0);
  });

  it("giá trị không phải số ⇒ 0", () => {
    const rubric = normalizeRubric({ clarity: "abc" });

    expect(rubric.clarity).toBe(0);
  });
});

describe("chuẩn hoá 4 nhóm lỗi (AC-CM-9)", () => {
  it("lọc bỏ phần tử rỗng", () => {
    const groups = normalizeErrorGroups({
      grammar: ["sai mạo từ", "  "],
      vocab: [],
    });

    expect(groups.grammar).toEqual(["sai mạo từ"]);
    expect(groups.vocab).toEqual([]);
    // Nhóm thiếu ⇒ mảng rỗng, không undefined.
    expect(groups.expression).toEqual([]);
    expect(groups.context).toEqual([]);
  });

  it("input không phải object ⇒ 4 nhóm rỗng", () => {
    const groups = normalizeErrorGroups(null);

    expect(groups.grammar).toEqual([]);
    expect(groups.vocab).toEqual([]);
  });
});

describe("chấm cục bộ (AC-CM-11 — KHÔNG giả lập AI)", () => {
  it("source luôn là 'local'", () => {
    const result = gradeLocally("This is a test sentence for grading.");

    expect(result.source).toBe("local");
  });

  it("bài rỗng ⇒ thông báo rõ, không điểm giả", () => {
    const result = gradeLocally("   ");

    expect(result.feedback).toContain("còn trống");
    expect(result.rubric.naturalness).toBe(0);
  });

  it("bài dài hơn ⇒ naturalness cao hơn", () => {
    const short = gradeLocally("Hello.");
    const long = gradeLocally(
      "This is a much longer piece of text with many more words in it to evaluate fluency properly.",
    );

    expect(long.rubric.naturalness).toBeGreaterThan(short.rubric.naturalness);
  });

  it("clarity đặt trung tính 2.5 khi không có AI", () => {
    // ⚠️ Không có AI ⇒ không thể chấm độ chính xác ⇒ trung tính, KHÔNG bịa.
    const result = gradeLocally("Some text here.");

    expect(result.rubric.clarity).toBe(2.5);
    expect(result.rubric.grammar).toBe(2.5);
  });
});
