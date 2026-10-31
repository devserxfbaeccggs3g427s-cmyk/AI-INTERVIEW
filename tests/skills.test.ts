import { describe, expect, it } from "vitest";

import {
  computeDomainLevel,
  computeLevelFromEvidence,
  evaluatePromotion,
  isoWeekKey,
  shortId,
} from "@/lib/skills";
import { EVIDENCE_RATING_MIN, EVIDENCE_THRESHOLD, SKILL_LEVEL_MAX } from "@/lib/config";

describe("công thức level (FR-SK-03)", () => {
  it("0 bằng chứng đạt chuẩn ⇒ level 0", () => {
    expect(computeLevelFromEvidence(0)).toBe(0);
  });

  it("2 bằng chứng đạt chuẩn ⇒ vẫn level 0 (chưa đủ ngưỡng)", () => {
    expect(computeLevelFromEvidence(EVIDENCE_THRESHOLD - 1)).toBe(0);
  });

  it("3 bằng chứng đạt chuẩn ⇒ level 1", () => {
    expect(computeLevelFromEvidence(EVIDENCE_THRESHOLD)).toBe(1);
  });

  it("⌊n/3⌋ — 5 ⇒ 1, 6 ⇒ 2, 9 ⇒ 3, 12 ⇒ 4", () => {
    expect(computeLevelFromEvidence(5)).toBe(1);
    expect(computeLevelFromEvidence(6)).toBe(2);
    expect(computeLevelFromEvidence(9)).toBe(3);
    expect(computeLevelFromEvidence(12)).toBe(4);
  });

  it("không vượt quá SKILL_LEVEL_MAX", () => {
    expect(computeLevelFromEvidence(1000)).toBe(SKILL_LEVEL_MAX);
  });

  it("level KHÔNG giảm khi bằng chứng bị xoá (hàm thuần, DB lo phần giảm)", () => {
    // Hàm thuần chỉ nhận số đếm — không có state để giảm.
    expect(computeLevelFromEvidence(6)).toBe(2);
    expect(computeLevelFromEvidence(3)).toBe(1);
  });
});

describe("level của node tầng 1 = MAX hậu duệ (FR-SK-07)", () => {
  it("lấy MAX", () => {
    expect(computeDomainLevel([1, 3, 2])).toBe(3);
  });

  it("không hậu duệ ⇒ 0", () => {
    expect(computeDomainLevel([])).toBe(0);
  });

  it("không vượt SKILL_LEVEL_MAX", () => {
    expect(computeDomainLevel([9, 9])).toBe(SKILL_LEVEL_MAX);
  });
});

describe("tiêu chuẩn thăng cấp (FR-SK-13)", () => {
  it("chưa có bằng chứng ⇒ thiếu đủ mốc đích, chưa đạt rating, chưa đạt nhịp", () => {
    const promotion = evaluatePromotion(0, null, 0);

    expect(promotion.missingStrongEvidence).toBe(EVIDENCE_THRESHOLD * 3);
    expect(promotion.unmet).toContain("evidence");
    expect(promotion.unmet).toContain("rating");
    expect(promotion.unmet).toContain("maintenance");
  });

  it("đủ BC cho mốc đích + TB ≥3 + BC gần đây ⇒ đạt hết", () => {
    // Mốc đích Cấp 3 ⇒ cần 3 × 3 = 9 BC đạt chuẩn.
    const promotion = evaluatePromotion(9, 3.5, 1, 3);

    expect(promotion.requiredEvidence).toBe(9);
    expect(promotion.missingStrongEvidence).toBe(0);
    expect(promotion.unmet).toEqual([]);
  });

  it("7/10 BC như prototype S04 ⇒ còn thiếu 2", () => {
    // Mốc đích Cấp 3 = 9 BC theo công thức level.
    const promotion = evaluatePromotion(7, 4, 5, 3);
    expect(promotion.requiredEvidence).toBe(9);
    expect(promotion.missingStrongEvidence).toBe(2);
  });

  it("mốc đích Cấp 4 ⇒ cần 12 BC", () => {
    const promotion = evaluatePromotion(9, 4, 5, 4);
    expect(promotion.requiredEvidence).toBe(12);
    expect(promotion.missingStrongEvidence).toBe(3);
  });

  it("thiếu bằng chứng ⇒ chưa đạt điều kiện evidence", () => {
    const promotion = evaluatePromotion(1, 4, 5);
    expect(promotion.unmet).toContain("evidence");
  });

  it("rating thấp ⇒ chưa đạt điều kiện rating", () => {
    const promotion = evaluatePromotion(6, 2.5, 5);
    expect(promotion.unmet).toContain("rating");
  });

  it("không có bằng chứng 14 ngày ⇒ chưa đạt nhịp duy trì", () => {
    const promotion = evaluatePromotion(6, 4, 0);
    expect(promotion.unmet).toContain("maintenance");
  });

  it("đã đạt level tối đa ⇒ không còn bằng chứng nào thiếu", () => {
    const promotion = evaluatePromotion(SKILL_LEVEL_MAX * EVIDENCE_THRESHOLD, 4, 5);
    expect(promotion.missingStrongEvidence).toBe(0);
    expect(promotion.unmet).toEqual([]);
  });
});

describe("mã định danh ngắn (FR-SK-12)", () => {
  it("6 ký tự cuối, viết hoa", () => {
    expect(shortId("cmvw2uozc00v0qb0xr9lppkuj")).toBe("LPPKUJ");
    expect(shortId("abc123")).toBe("ABC123");
  });

  it("id ngắn hơn 6 ký tự ⇒ trả về nguyên", () => {
    expect(shortId("ab")).toBe("AB");
  });
});

describe("khoá tuần ISO", () => {
  it("cùng tuần ⇒ cùng khoá", () => {
    // 2026-10-26 (Thứ Hai) và 2026-11-01 (Chủ Nhật) — cùng tuần ISO.
    expect(isoWeekKey(new Date(2026, 9, 26))).toBe(isoWeekKey(new Date(2026, 10, 1)));
  });

  it("khác tuần ⇒ khác khoá", () => {
    expect(isoWeekKey(new Date(2026, 9, 26))).not.toBe(isoWeekKey(new Date(2026, 10, 2)));
  });

  it("định dạng yyyy-Www", () => {
    expect(isoWeekKey(new Date(2026, 0, 5))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("ngưỡng bằng chứng đạt chuẩn", () => {
  it("EVIDENCE_RATING_MIN = 3 (bằng chứng đạt chuẩn)", () => {
    expect(EVIDENCE_RATING_MIN).toBe(3);
  });

  it("EVIDENCE_THRESHOLD = 3 (số BC cho 1 level)", () => {
    expect(EVIDENCE_THRESHOLD).toBe(3);
  });
});
