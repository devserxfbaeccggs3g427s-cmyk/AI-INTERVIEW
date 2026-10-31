import { describe, expect, it } from "vitest";

import {
  analyzeCorrelation,
  classifyLocally,
  getContextQuestions,
  JOURNAL_DOMAINS,
  pearson,
  resolveJournalContext,
} from "@/lib/journal";

describe("ngữ cảnh nhật ký (FR-PSJ-02)", () => {
  it("8:00–13:00 ⇒ sau buổi học", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 9, 0))).toBe("after_study");
    expect(resolveJournalContext(new Date(2026, 9, 28, 12, 30))).toBe("after_study");
  });

  it("19:00–23:00 ⇒ cuối ngày", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 19, 0))).toBe("end_of_day");
    expect(resolveJournalContext(new Date(2026, 9, 28, 22, 59))).toBe("end_of_day");
  });

  it("Thứ 7–Chủ nhật ⇒ cuối tuần", () => {
    // 2026-11-01 là Chủ nhật.
    expect(resolveJournalContext(new Date(2026, 10, 1, 10, 0))).toBe("end_of_week");
    // 2026-10-31 là Thứ Bảy.
    expect(resolveJournalContext(new Date(2026, 9, 31, 15, 0))).toBe("end_of_week");
  });

  it("ngoài các khung ⇒ bất cứ lúc nào", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 15, 0))).toBe("anytime");
    expect(resolveJournalContext(new Date(2026, 9, 28, 23, 30))).toBe("anytime");
  });
});

describe("câu hỏi gợi ý (FR-PS-02)", () => {
  it("mỗi ngữ cảnh có đúng 3 câu", () => {
    for (const context of [
      "after_study",
      "end_of_day",
      "end_of_week",
      "anytime",
    ] as const) {
      expect(getContextQuestions(context)).toHaveLength(3);
    }
  });

  it("câu hỏi khác nhau theo ngữ cảnh", () => {
    const study = getContextQuestions("after_study");
    const day = getContextQuestions("end_of_day");

    expect(study).not.toEqual(day);
  });
});

describe("tương quan Pearson (FR-PS-05)", () => {
  it("tương quan hoàn hảo dương = 1", () => {
    expect(
      pearson([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
      ]),
    ).toBe(1);
  });

  it("tương quan hoàn hảo âm = −1", () => {
    expect(
      pearson([
        { x: 1, y: 6 },
        { x: 2, y: 4 },
        { x: 3, y: 2 },
      ]),
    ).toBe(-1);
  });

  it("tương quan yếu ⇒ |r| < 0.4", () => {
    // ⚠️ Không thể có r = 0 tuyệt đối với dữ liệu nguyên nhỏ — đây là thực
    // tế của Pearson, không phải lỗi. Ngưỡng dùng để phân loại là ±0.5.
    const r = pearson([
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 3 },
      { x: 4, y: 2 },
    ]);

    expect(Math.abs(r)).toBeLessThan(0.4);
  });

  it("<2 điểm ⇒ 0 (không đủ dữ liệu)", () => {
    expect(pearson([{ x: 1, y: 1 }])).toBe(0);
    expect(pearson([])).toBe(0);
  });

  it("hằng số một phía ⇒ 0 (không chia cho 0)", () => {
    expect(
      pearson([
        { x: 3, y: 1 },
        { x: 3, y: 2 },
      ]),
    ).toBe(0);
  });
});

describe("phân tích tương quan (FR-PS-05, FR-PS-07)", () => {
  it("bỏ qua ngày thiếu chỉ số", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
      { sleep: null, mood: 3, energy: 3, focus: 3, doneSlots: 3 },
    ]);

    const sleep = result.find((r) => r.metric === "sleep");
    expect(sleep?.samples).toBe(2);
  });

  it("<3 mẫu ⇒ nói chưa đủ dữ liệu", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
    ]);

    for (const item of result) {
      expect(item.insight).toContain("Chưa đủ dữ liệu");
    }
  });

  it("ngủ nhiều ⇒ nhiều hành động hơn", () => {
    const result = analyzeCorrelation([
      { sleep: 8, mood: 4, energy: 4, focus: 4, doneSlots: 6 },
      { sleep: 7, mood: 4, energy: 4, focus: 4, doneSlots: 5 },
      { sleep: 5, mood: 3, energy: 3, focus: 3, doneSlots: 2 },
      { sleep: 4, mood: 2, energy: 2, focus: 2, doneSlots: 1 },
    ]);

    const sleep = result.find((r) => r.metric === "sleep");
    expect(sleep?.correlation).toBeGreaterThan(0.5);
    expect(sleep?.insight).toContain("nhiều hành động hoàn thành hơn");
  });

  it("trả đủ 4 chỉ số", () => {
    const result = analyzeCorrelation([]);
    expect(result.map((r) => r.metric)).toEqual([
      "sleep",
      "mood",
      "energy",
      "focus",
    ]);
  });
});


describe("phân loại cục bộ (FR-PSJ-11, RB-03)", () => {
  it("luôn trả source = 'local' — KHÔNG giả lập AI", () => {
    const result = classifyLocally("Hôm nay học Java Spring Boot");
    expect(result.source).toBe("local");
  });

  it("nhận diện domain chuyên môn", () => {
    const result = classifyLocally("Sửa bug API Java Spring Boot hôm nay");
    expect(result.domain).toBe("chuyên_môn");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it("nhận diện domain ngoại ngữ", () => {
    const result = classifyLocally("Ôn lại từ vựng tiếng Anh hôm nay");
    expect(result.domain).toBe("ngoại_ngữ");
  });

  it("nhận diện domain giao tiếp", () => {
    const result = classifyLocally("Chuẩn bị phỏng vấn mock interview");
    expect(result.domain).toBe("giao_tiếp");
  });

  it("nhận diện domain cá nhân", () => {
    const result = classifyLocally("Hôm nay ngủ ít nên rất mệt và mất tập trung");
    expect(result.domain).toBe("cá_nhân");
  });

  it("không có từ khoá ⇒ mặc định cá_nhân + confidence thấp", () => {
    const result = classifyLocally("xyzzy abc");
    expect(result.domain).toBe("cá_nhân");
    expect(result.confidence).toBeLessThan(0.3);
  });

  it("confidence luôn trong [0, 1]", () => {
    for (const text of [
      "java java java java api api sql",
      "xyzzy",
      "ngủ mệt mệt mệt ngủ",
    ]) {
      const { confidence } = classifyLocally(text);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });

  it("4 domain đóng băng", () => {
    expect(JOURNAL_DOMAINS).toHaveLength(4);
  });
});
