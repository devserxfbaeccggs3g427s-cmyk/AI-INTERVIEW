/**
 * Unit test — công thức chi phí AI (FR-SC-18).
 *
 * ⚠️ Kiểm chứng hành vi thật: `estimateCost` tính theo bảng giá model,
 * làm tròn 6 chữ số thập phân. Model stranger KHÔNG có trong `PRICING` ⇒
 * throw (phải dùng `FALLBACK_PRICING` = bảng Opus 5 ở layer UI).
 */

import { describe, expect, it } from "vitest";

import { estimateCost, PRICING, type TokenUsage } from "@/lib/anthropic";
import { FALLBACK_PRICING } from "@/lib/costs";
import type { AIModel } from "@/lib/anthropic";

describe("estimateCost (FR-SC-18)", () => {
  const opus: TokenUsage = { inputTokens: 3420, outputTokens: 420, cacheRead: 3100, cacheWrite: 0 };
  const haiku: TokenUsage = { inputTokens: 450, outputTokens: 65, cacheRead: 0, cacheWrite: 0 };

  it("Opus 5: 3420 in / 3100 cacheRead / 420 out = 0.02915 (AC-SC-11)", () => {
    // 3420×5/1e6 + 3100×0.5/1e6 + 420×25/1e6 = 0.0171 + 0.00155 + 0.0105 = 0.02915
    expect(estimateCost("claude-opus-5", opus)).toBe(0.02915);
  });

  it("Haiku 4.5: 450 in / 65 out = 0.000775 (AC-SC-11)", () => {
    // 450×1/1e6 + 65×5/1e6 = 0.00045 + 0.000325 = 0.000775
    expect(estimateCost("claude-haiku-4-5", haiku)).toBe(0.000775);
  });

  it("cache write = input × 1.25 (FR-SC-18 · §6.5)", () => {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 1000 };
    // 1000 × 5 × 1.25 / 1_000_000 = 0.00625
    expect(estimateCost("claude-opus-5", usage)).toBeCloseTo(0.00625, 6);
  });

  it("cache read = input × 0.1 (FR-AI-08 · §6.5)", () => {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 1000, cacheWrite: 0 };
    // 1000 × 5 × 0.1 / 1_000_000 = 0.0005
    expect(estimateCost("claude-opus-5", usage)).toBeCloseTo(0.0005, 6);
  });

  it("Haiku cache read = input × 0.1 (FR-AI-08)", () => {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 1000, cacheWrite: 0 };
    expect(estimateCost("claude-haiku-4-5", usage)).toBeCloseTo(0.0001, 6);
  });

  it("tất cả thành phần cộng vào chi phí (FR-SC-18)", () => {
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 500, cacheRead: 200, cacheWrite: 100 };
    // opus: 1000×5 + 500×25 + 200×0.5 + 100×6.25 = 5000+12500+100+625 = 18225 / 1e6
    expect(estimateCost("claude-opus-5", usage)).toBeCloseTo(0.018225, 6);
  });

  it("làm tròn 6 chữ số thập phân, không bao giờ NaN", () => {
    const usage: TokenUsage = { inputTokens: 1, outputTokens: 1, cacheRead: 1, cacheWrite: 1 };
    const v = estimateCost("claude-opus-5", usage);
    expect(Number.isFinite(v)).toBe(true);
    // 1×5 + 1×25 + 1×0.5 + 1×6.25 = 36.75 / 1e6 = 0.00003675 → round 6 = 0.000037
    expect(v).toBe(0.000037);
  });

  it("model stranger ⇒ estimateCost throw (phải dùng FALLBACK_PRICING ở UI)", () => {
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 0, cacheRead: 0, cacheWrite: 0 };
    expect(() =>
      (estimateCost as (m: string, u: TokenUsage) => number)("gpt-4", usage),
    ).toThrow();
  });

  it("FALLBACK_PRICING = bảng Opus 5 (FR-SC-18 · không ước tính thấp hơn thực tế)", () => {
    expect(FALLBACK_PRICING.input).toBe(PRICING["claude-opus-5" as AIModel].input);
    expect(FALLBACK_PRICING.output).toBe(PRICING["claude-opus-5" as AIModel].output);
    expect(FALLBACK_PRICING.cacheReadMultiplier).toBe(
      PRICING["claude-opus-5" as AIModel].cacheReadMultiplier,
    );
    expect(FALLBACK_PRICING.cacheWriteMultiplier).toBe(
      PRICING["claude-opus-5" as AIModel].cacheWriteMultiplier,
    );
  });

  it("bảng giá Opus 5 = $5/$25 (SPEC §5.7)", () => {
    expect(PRICING["claude-opus-5" as AIModel].input).toBe(5);
    expect(PRICING["claude-opus-5" as AIModel].output).toBe(25);
  });

  it("bảng giá Haiku 4.5 = $1/$5 (SPEC §5.7)", () => {
    expect(PRICING["claude-haiku-4-5" as AIModel].input).toBe(1);
    expect(PRICING["claude-haiku-4-5" as AIModel].output).toBe(5);
  });
});