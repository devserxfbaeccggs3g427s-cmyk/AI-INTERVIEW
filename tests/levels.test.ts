/**
 * Unit test — thang CEFR / HSK (FR-SC-05).
 *
 * Kiểm chứng `LEVEL_ORDER` (7 bậc zero·A1·A2·B1·B2·C1·C2),
 * `levelsForLanguage` (zh ⇒ HSK, en/vi ⇒ CEFR), `isValidLevel`.
 */

import { describe, expect, it } from "vitest";

import {
  CEFR_LEVELS,
  HSK_LEVELS,
  LEVEL_ORDER,
  CEFR_LABELS,
  HSK_LABELS,
  LEVEL_LABELS,
  levelsForLanguage,
  levelLabel,
  standardLabel,
  isValidLevel,
} from "@/lib/levels";

// 使用以避免 unused-vars lint 错误
const _usedLabels = { CEFR_LABELS, HSK_LABELS };

describe("thang CEFR (FR-SC-05)", () => {
  it("đủ 7 bậc zero·A1..C2", () => {
    expect(CEFR_LEVELS).toEqual(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("không chứa thang cũ (beginner/intermediate/...)", () => {
    for (const level of CEFR_LEVELS) {
      expect(level).not.toMatch(/beginner|elementary|intermediate|upper/i);
    }
  });
});

describe("thang HSK (FR-SC-05)", () => {
  it("đủ 7 bậc zero..6", () => {
    expect(HSK_LEVELS).toEqual(["zero", "1", "2", "3", "4", "5", "6"]);
  });
});

describe("LEVEL_ORDER (FR-SC-05 · Q7)", () => {
  it("7 bậc zero·A1·A2·B1·B2·C1·C2 theo thứ tự tăng dần", () => {
    expect(LEVEL_ORDER).toEqual(["zero", "A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("không chứa thang cũ", () => {
    for (const level of LEVEL_ORDER) {
      expect(level).not.toMatch(/beginner|elementary|intermediate|upper/i);
    }
  });
});

describe("levelsForLanguage (FR-SC-05)", () => {
  it("tiếng Trung ⇒ HSK (7 bậc)", () => {
    expect(levelsForLanguage("zh")).toEqual(HSK_LEVELS);
  });

  it("tiếng Anh ⇒ CEFR (6 bậc)", () => {
    expect(levelsForLanguage("en")).toEqual(CEFR_LEVELS);
  });

  it("tiếng Việt ⇒ CEFR (6 bậc)", () => {
    expect(levelsForLanguage("vi")).toEqual(CEFR_LEVELS);
  });
});

describe("levelLabel (FR-SC-05)", () => {
  it("zh ⇒ HSK_LABELS", () => {
    expect(levelLabel("4", "zh")).toBe("HSK 4 — 1000 từ");
    expect(levelLabel("zero", "zh")).toBe("Chưa học");
  });

  it("en ⇒ CEFR_LABELS", () => {
    expect(levelLabel("B2", "en")).toBe("Trung cấp — thảo luận, viết rõ ràng");
  });

  it("mức không hợp lệ ⇒ trả nguyên giá trị", () => {
    expect(levelLabel("xyz", "en")).toBe("xyz");
  });
});

describe("standardLabel (FR-SC-25 · C32)", () => {
  it("cefr ⇒ CEFR", () => {
    expect(standardLabel("cefr")).toBe("CEFR");
  });

  it("hsk ⇒ HSK", () => {
    expect(standardLabel("hsk")).toBe("HSK");
  });

  it("both ⇒ CEFR + HSK", () => {
    expect(standardLabel("both")).toBe("CEFR + HSK");
  });
});

describe("isValidLevel (FR-SC-05)", () => {
  it("zh: '4' hợp lệ, 'B2' không hợp lệ", () => {
    expect(isValidLevel("4", "zh")).toBe(true);
    expect(isValidLevel("B2", "zh")).toBe(false);
  });

  it("en: 'B2' hợp lệ, '4' không hợp lệ", () => {
    expect(isValidLevel("B2", "en")).toBe(true);
    expect(isValidLevel("4", "en")).toBe(false);
  });

  it("vi: 'B2' hợp lệ", () => {
    expect(isValidLevel("B2", "vi")).toBe(true);
  });

  it("mức zero hợp lệ cho cả zh và en (CEFR_LEVELS bắt đầu bằng zero)", () => {
    expect(isValidLevel("zero", "zh")).toBe(true);
    expect(isValidLevel("zero", "en")).toBe(true);
  });
});

describe("LEVEL_LABELS hợp nhất", () => {
  it("chứa cả CEFR và HSK", () => {
    expect(LEVEL_LABELS["B2"]).toBeTruthy();
    expect(LEVEL_LABELS["4"]).toBeTruthy();
    expect(LEVEL_LABELS["zero"]).toBeTruthy();
  });
});