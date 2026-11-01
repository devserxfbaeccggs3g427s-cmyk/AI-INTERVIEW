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
      "accuracy",
      "fluency",
      "vocabulary",
      "grammar",
      "coherence",
    ]);
  });
});

describe("tổng điểm = trung bình 5 tiêu chí (AC-CM-2, NFR-CM-06)", () => {
  it("mọi tiêu chí = 4 ⇒ tổng = 4", () => {
    expect(
      averageRubric({
        accuracy: 4,
        fluency: 4,
        vocabulary: 4,
        grammar: 4,
        coherence: 4,
      }),
    ).toBe(4);
  });

  it("điểm lệch nhau ⇒ trung bình, không phải max", () => {
    const score = averageRubric({
      accuracy: 5,
      fluency: 2,
      vocabulary: 3,
      grammar: 2,
      coherence: 3,
    });

    // (5+2+3+2+3)/5 = 3
    expect(score).toBe(3);
    expect(score).not.toBe(5);
  });

  it("làm tròn 1 chữ số thập phân", () => {
    const score = averageRubric({
      accuracy: 3.33,
      fluency: 3.33,
      vocabulary: 3.33,
      grammar: 3.33,
      coherence: 3.33,
    });

    expect(score).toBe(3.3);
  });
});

describe("chuẩn hoá rubric từ AI", () => {
  it("thiếu tiêu chí ⇒ điểm 0, không NaN", () => {
    const rubric = normalizeRubric({ accuracy: 4 });

    expect(rubric.accuracy).toBe(4);
    expect(rubric.fluency).toBe(0);
    expect(Number.isNaN(rubric.grammar)).toBe(false);
  });

  it("ép điểm trong 0..5", () => {
    const rubric = normalizeRubric({
      accuracy: 99,
      fluency: -5,
      vocabulary: 3,
      grammar: 3,
      coherence: 3,
    });

    expect(rubric.accuracy).toBe(5);
    expect(rubric.fluency).toBe(0);
  });

  it("giá trị không phải số ⇒ 0", () => {
    const rubric = normalizeRubric({ accuracy: "abc" });

    expect(rubric.accuracy).toBe(0);
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
    expect(result.rubric.fluency).toBe(0);
  });

  it("bài dài hơn ⇒ fluency cao hơn", () => {
    const short = gradeLocally("Hello.");
    const long = gradeLocally(
      "This is a much longer piece of text with many more words in it to evaluate fluency properly.",
    );

    expect(long.rubric.fluency).toBeGreaterThan(short.rubric.fluency);
  });

  it("accuracy đặt trung tính 2.5 khi không có AI", () => {
    // ⚠️ Không có AI ⇒ không thể chấm độ chính xác ⇒ trung tính, KHÔNG bịa.
    const result = gradeLocally("Some text here.");

    expect(result.rubric.accuracy).toBe(2.5);
    expect(result.rubric.grammar).toBe(2.5);
  });
});
