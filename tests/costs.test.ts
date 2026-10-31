import { describe, expect, it } from "vitest";

import {
  buildPreview,
  cacheHitRate,
  FEATURE_LABELS,
  maskKey,
} from "@/lib/costs";

describe("cacheHitRate (FR-SC-19)", () => {
  it("mẫu số = 0 ⇒ 0 (KHÔNG phải NaN)", () => {
    expect(cacheHitRate({ inputTokens: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });

  it("0 hit ⇒ 0", () => {
    expect(
      cacheHitRate({ inputTokens: 100, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(0);
  });

  it("100% hit ⇒ 1", () => {
    expect(
      cacheHitRate({ inputTokens: 0, cacheRead: 100, cacheWrite: 0 }),
    ).toBe(1);
  });

  it("hit một phần", () => {
    // 50 cacheRead / (100 + 50) = 1/3
    expect(
      cacheHitRate({ inputTokens: 100, cacheRead: 50, cacheWrite: 0 }),
    ).toBeCloseTo(0.3333, 3);
  });
});

describe("buildPreview (FR-SC-27)", () => {
  it("text ngắn hơn max ⇒ giữ nguyên", () => {
    expect(buildPreview("ngắn")).toBe("ngắn");
  });

  it("gộp khoảng trắng thành 1", () => {
    expect(buildPreview("a    b\n\nc")).toBe("a b c");
  });

  it("text dài hơn max ⇒ cắt + thêm …", () => {
    const text = "x".repeat(400);
    const result = buildPreview(text, 100);

    expect(result.length).toBeLessThanOrEqual(101);
    expect(result.endsWith("…")).toBe(true);
  });

  it("cắt giữa câu khi có dấu câu trong khoảng max", () => {
    // Câu 1 kết thúc ở ký tự ~50 (trong khoảng max = 100).
    const text = `${"a ".repeat(25)}. ${"b ".repeat(200)}`;
    const result = buildPreview(text, 100);

    expect(result.endsWith("…")).toBe(true);
    // Kết thúc bằng dấu chấm câu (cắt giữa câu) + …
    expect(result).toMatch(/\.…$/);
    // Không cắt quá 50% độ dài cho phép.
    expect(result.length).toBeLessThan(101);
  });

  it("mặc định max = 280", () => {
    const result = buildPreview("y".repeat(500));
    expect(result.length).toBeLessThanOrEqual(281);
  });
});

describe("maskKey (FR-SC-11)", () => {
  it("key ngắn (< 8 ký tự) ⇒ ••••, không lộ ký tự nào", () => {
    expect(maskKey("abc")).toBe("••••");
    expect(maskKey("")).toBe("");
  });

  it("key dài ⇒ 7 ký tự đầu + 4 ký tự cuối", () => {
    const masked = maskKey("sk-ant-1234567890abcdef");

    expect(masked.startsWith("sk-ant-")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).toContain("•");
    // Không chứa phần giữa.
    expect(masked).not.toContain("567890ab");
  });
});

describe("FEATURE_LABELS (FR-SC-16)", () => {
  it("có nhãn cho các tính năng chính", () => {
    for (const feature of [
      "daily_plan",
      "grading",
      "journal_feedback",
      "weekly_review",
      "classify",
    ]) {
      expect(FEATURE_LABELS[feature]).toBeTruthy();
      expect(FEATURE_LABELS[feature].label.length).toBeGreaterThan(0);
    }
  });

  it("mọi tone nằm trong tập cho phép", () => {
    const tones = new Set(["primary", "secondary", "tertiary", "neutral"]);

    for (const entry of Object.values(FEATURE_LABELS)) {
      expect(tones.has(entry.tone)).toBe(true);
    }
  });
});
