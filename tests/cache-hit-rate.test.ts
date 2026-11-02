/**
 * Unit test — cache hit rate (FR-SC-19).
 *
 * Công thức: cacheRead / (inputTokens + cacheRead + cacheWrite).
 * Mẫu số = 0 ⇒ trả 0 (KHÔNG NaN).
 */

import { describe, expect, it } from "vitest";

import { cacheHitRate } from "@/lib/costs";

describe("cacheHitRate (FR-SC-19)", () => {
  it("mẫu số = 0 ⇒ 0 (KHÔNG phải NaN)", () => {
    expect(cacheHitRate({ inputTokens: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });

  it("0 hit ⇒ 0", () => {
    expect(cacheHitRate({ inputTokens: 100, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });

  it("100% hit ⇒ 1", () => {
    expect(cacheHitRate({ inputTokens: 0, cacheRead: 100, cacheWrite: 0 })).toBe(1);
  });

  it("hit một phần: 50 cacheRead / (100 + 50) = 1/3", () => {
    expect(cacheHitRate({ inputTokens: 100, cacheRead: 50, cacheWrite: 0 })).toBeCloseTo(
      0.3333,
      3,
    );
  });

  it("cacheWrite cũng tính vào mẫu số", () => {
    // 50 / (100 + 50 + 25) = 50/175 ≈ 0.2857
    expect(cacheHitRate({ inputTokens: 100, cacheRead: 50, cacheWrite: 25 })).toBeCloseTo(
      0.2857,
      3,
    );
  });

  it("làm tròn 4 chữ số (theo implement)", () => {
    // 1/4 = 0.25
    expect(cacheHitRate({ inputTokens: 3, cacheRead: 1, cacheWrite: 0 })).toBe(0.25);
  });
});