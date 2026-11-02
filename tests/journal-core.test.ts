import { describe, expect, it } from "vitest";

import {
  resolveJournalContext,
  getContextQuestions,
  classifyLocally,
  JOURNAL_DOMAINS,
} from "@/lib/journal";

/**
 * FR-PSJ-02 — Câu hỏi gợi ý theo ngữ cảnh (8–13: sau buổi học, 19–23: cuối ngày,
 * T7–CN: cuối tuần, fallback: bất cứ lúc nào).
 * FR-PS-02 — 3 câu hỏi gợi ý cho mỗi ngữ cảnh.
 * FR-PSJ-11 + RB-03 — Phân loại cục bộ: luôn source="local", không gọi AI.
 */
describe("FR-PSJ-02..FR-PS-05 — journal.ts ngữ cảnh, câu hỏi, phân loại cục bộ", () => {
  it("resolveJournalContext: 8:00–13:00 T2–T6 → after_study", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 8, 0))).toBe("after_study");
    expect(resolveJournalContext(new Date(2026, 9, 28, 9, 0))).toBe("after_study");
    expect(resolveJournalContext(new Date(2026, 9, 28, 12, 30))).toBe("after_study");
    // T2–T6
    expect(resolveJournalContext(new Date(2026, 9, 27, 10, 0))).toBe("after_study");
  });

  it("resolveJournalContext: 19:00–23:00 → end_of_day", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 19, 0))).toBe("end_of_day");
    expect(resolveJournalContext(new Date(2026, 9, 28, 22, 59))).toBe("end_of_day");
  });

  it("resolveJournalContext: Thứ 7–Chủ nhật → end_of_week (ưu tiên cao nhất)", () => {
    // 2026-11-01 là Chủ nhật.
    expect(resolveJournalContext(new Date(2026, 10, 1, 10, 0))).toBe("end_of_week");
    // 2026-10-31 là Thứ Bảy.
    expect(resolveJournalContext(new Date(2026, 9, 31, 15, 0))).toBe("end_of_week");
    // Cuối tuần ưu tiên hơn sau buổi học (8-13) trong T7/CN.
    expect(resolveJournalContext(new Date(2026, 10, 1, 9, 0))).toBe("end_of_week");
  });

  it("resolveJournalContext: ngoài khung giờ → anytime (fallback)", () => {
    expect(resolveJournalContext(new Date(2026, 9, 28, 15, 0))).toBe("anytime");
    expect(resolveJournalContext(new Date(2026, 9, 28, 23, 30))).toBe("anytime");
  });

  it("getContextQuestions: mỗi ngữ cảnh có đúng 3 câu", () => {
    for (const context of [
      "after_study",
      "end_of_day",
      "end_of_week",
      "anytime",
    ] as const) {
      expect(getContextQuestions(context)).toHaveLength(3);
    }
  });

  it("getContextQuestions: câu hỏi khác nhau theo ngữ cảnh", () => {
    const study = getContextQuestions("after_study");
    const day = getContextQuestions("end_of_day");

    expect(study).not.toEqual(day);
  });

  it("classifyLocally: luôn trả source = 'local' — KHÔNG giả lập AI", () => {
    const result = classifyLocally("Hôm nay học Java Spring Boot");
    expect(result.source).toBe("local");
  });

  it("classifyLocally: nhận diện domain chuyên_môn", () => {
    const result = classifyLocally("Sửa bug API Java Spring Boot hôm nay");
    expect(result.domain).toBe("chuyên_môn");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it("classifyLocally: nhận diện domain ngoại_ngữ", () => {
    const result = classifyLocally("Ôn lại từ vựng tiếng Anh hôm nay");
    expect(result.domain).toBe("ngoại_ngữ");
  });

  it("classifyLocally: nhận diện domain giao_tiếp", () => {
    const result = classifyLocally("Chuẩn bị phỏng vấn mock interview");
    expect(result.domain).toBe("giao_tiếp");
  });

  it("classifyLocally: nhận diện domain cá_nhân", () => {
    const result = classifyLocally("Hôm nay ngủ ít nên rất mệt và mất tập trung");
    expect(result.domain).toBe("cá_nhân");
  });

  it("classifyLocally: không có từ khoá → mặc định cá_nhân + confidence thấp", () => {
    const result = classifyLocally("xyzzy abc");
    expect(result.domain).toBe("cá_nhân");
    expect(result.confidence).toBeLessThan(0.3);
  });

  it("classifyLocally: confidence luôn trong [0, 1]", () => {
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

  it("JOURNAL_DOMAINS có đúng 4 domain đóng băng", () => {
    expect(JOURNAL_DOMAINS).toHaveLength(4);
  });
});