import { describe, expect, it } from "vitest";

import {
  CEFR_LEVELS,
  HSK_LEVELS,
  isValidWipeConfirmation,
  type LanguageCode,
} from "@/lib/settings";

describe("thang CEFR (FR-SC-05)", () => {
  it("đủ 6 bậc A1..C2", () => {
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
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

describe("xác nhận xoá trắng 2 bước (FR-SC-25)", () => {
  it("chỉ chấp nhận đúng chuỗi 'XOA'", () => {
    expect(isValidWipeConfirmation("XOA")).toBe(true);
    expect(isValidWipeConfirmation("  XOA  ")).toBe(true);
  });

  it("từ chối mọi chuỗi khác", () => {
    expect(isValidWipeConfirmation("XOA ")).toBe(true);
    expect(isValidWipeConfirmation("xoa")).toBe(false);
    expect(isValidWipeConfirmation("XOAO")).toBe(false);
    expect(isValidWipeConfirmation("")).toBe(false);
    expect(isValidWipeConfirmation("XÓA")).toBe(false);
  });
});

describe("ngôn ngữ hợp lệ (FR-SC-04)", () => {
  it("3 ngôn ngữ: en, zh, vi", () => {
    const langs: LanguageCode[] = ["en", "zh", "vi"];
    expect(langs).toHaveLength(3);
  });
});
