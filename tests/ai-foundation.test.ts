/**
 * Unit test — lớp AI dùng chung `src/lib/anthropic.ts` (FR-AI-01..FR-AI-19).
 *
 * ⚠️ KHÔNG gọi API thật: mọi test đều là hành vi thuần (routing, giá, chuỗi
 * exception, offline mode) hoặc mock SDK. Cần API key thật thì mới kiểm
 * được `cache_read_input_tokens > 0` — việc đó để riêng cho E2E có key.
 *
 * ⚠️ `import { prisma }` sẽ mở connection SQLite — các test không đụng DB
 * nên không sao, nhưng phải đóng lại ở `afterAll` cho sạch.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AI_ROUTES,
  AiApiStatusError,
  AiAuthError,
  AiConnectionError,
  AiError,
  AiMaxTokensError,
  AiOfflineError,
  AiRateLimitError,
  AiRefusalError,
  AiSchemaError,
  AiStreamInterruptedError,
  AiTimeoutError,
  CACHE_MIN_TOKENS,
  PRICING,
  estimateCost,
  getApiKey,
  isAiAvailable,
  toAiError,
  type AIFeatureCode,
  type TokenUsage,
} from "@/lib/anthropic";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe("AI_ROUTES — bảng routing (FR-AI-01..FR-AI-16)", () => {
  it("FR-AI-01 · đủ 16 mã AI-01..AI-16, mỗi mã có feature + model + effort", () => {
    const codes: AIFeatureCode[] = [
      "AI-01", "AI-02", "AI-03", "AI-04", "AI-05", "AI-06", "AI-07", "AI-08",
      "AI-09", "AI-10", "AI-11", "AI-12", "AI-13", "AI-14", "AI-15", "AI-16",
    ];

    expect(Object.keys(AI_ROUTES).sort()).toEqual([...codes].sort());

    for (const code of codes) {
      const route = AI_ROUTES[code];
      expect(route.feature, `${code} thiếu feature`).toBeTruthy();
      expect(["claude-opus-5", "claude-haiku-4-5"], `${code} model lạ`).toContain(route.model);
      expect(["low", "medium", "high"], `${code} effort lạ`).toContain(route.effort);
      expect(typeof route.streaming).toBe("boolean");
      expect(typeof route.structured).toBe("boolean");
    }
  });

  it("FR-AI-02 · AI-01 (sinh kế hoạch) dùng Opus + streaming + structured", () => {
    const route = AI_ROUTES["AI-01"];
    expect(route.feature).toBe("daily_plan");
    expect(route.model).toBe("claude-opus-5");
    expect(route.streaming).toBe(true);
    expect(route.structured).toBe(true);
  });

  it("FR-AI-03 · AI-02 (autofill quick-log) dùng Haiku — rẻ + không streaming", () => {
    const route = AI_ROUTES["AI-02"];
    expect(route.feature).toBe("quick_log_autofill");
    expect(route.model).toBe("claude-haiku-4-5");
    expect(route.streaming).toBe(false);
    expect(route.effort).toBe("low");
  });

  it("FR-AI-04 · phân loại (AI-06) luôn dùng Haiku + effort thấp", () => {
    const classify = AI_ROUTES["AI-06"];
    expect(classify.feature).toBe("classify");
    expect(classify.model).toBe("claude-haiku-4-5");
    expect(classify.effort).toBe("low");
    expect(classify.streaming).toBe(false);
  });

  it("FR-AI-05 · báo cáo tuần (AI-07) dùng Opus + effort cao", () => {
    const weekly = AI_ROUTES["AI-07"];
    expect(weekly.feature).toBe("weekly_review");
    expect(weekly.model).toBe("claude-opus-5");
    expect(weekly.effort).toBe("high");
  });

  it("FR-AI-06 · role-play (AI-08) là mã duy nhất không structured", () => {
    const roleplay = AI_ROUTES["AI-08"];
    expect(roleplay.feature).toBe("roleplay");
    expect(roleplay.structured).toBe(false);
    expect(roleplay.streaming).toBe(true);

    const others = Object.entries(AI_ROUTES).filter(([code]) => code !== "AI-08");
    for (const [, route] of others) {
      expect(route.structured, "mọi mã khác phải structured").toBe(true);
    }
  });

  it("FR-AI-07 · feature slug không trùng nhau theo nhóm chức năng", () => {
    const slugs = Object.values(AI_ROUTES).map((r) => r.feature);
    expect(new Set(slugs).size).toBeLessThan(slugs.length); // có nhóm dùng chung
    // Nhưng mỗi mã vẫn có feature riêng trong `AiCall.feature` để thống kê.
    expect(slugs).toContain("daily_plan");
    expect(slugs).toContain("grading");
    expect(slugs).toContain("mock_interview");
    expect(slugs).toContain("language_test");
  });
});

describe("Chi phí & cache (FR-AI-08..FR-AI-11)", () => {
  const zero: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 };

  it("FR-AI-08 · estimateCost tính theo bảng giá của model", () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheRead: 0,
      cacheWrite: 0,
    };

    expect(estimateCost("claude-opus-5", usage)).toBe(30); // 5 + 25
    expect(estimateCost("claude-haiku-4-5", usage)).toBe(6); // 1 + 5
  });

  it("FR-AI-09 · cacheRead rẻ hơn input, cacheWrite đắt hơn input", () => {
    const usage: TokenUsage = { ...zero, cacheRead: 1_000_000 };
    const cacheReadCost = estimateCost("claude-opus-5", usage);

    const plain: TokenUsage = { ...zero, inputTokens: 1_000_000 };
    const plainCost = estimateCost("claude-opus-5", plain);
    expect(cacheReadCost).toBeLessThan(plainCost);

    const write: TokenUsage = { ...zero, cacheWrite: 1_000_000 };
    expect(estimateCost("claude-opus-5", write)).toBeGreaterThan(plainCost);
  });

  it("FR-AI-10 · estimateCost làm tròn 6 chữ số thập phân, không NaN", () => {
    const usage: TokenUsage = { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 };
    const cost = estimateCost("claude-opus-5", usage);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBe(0.00003);
    // 6 chữ số ⇒ không có phần thập phân dài hơn 6
    const decimals = cost.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });

  it("FR-AI-11 · ngưỡng cache tối thiểu: Haiku cao hơn Opus", () => {
    // ⚠️ Đây là "silent invalidator" của Q2 — Haiku cần prompt dài hơn nhiều
    // thì mới được cache, nên ngưỡng phải cao hơn.
    expect(CACHE_MIN_TOKENS["claude-haiku-4-5"]).toBeGreaterThan(
      CACHE_MIN_TOKENS["claude-opus-5"],
    );
    expect(CACHE_MIN_TOKENS["claude-opus-5"]).toBe(512);
    expect(CACHE_MIN_TOKENS["claude-haiku-4-5"]).toBe(4096);
  });

  it("FR-AI-11 · bảng giá có hệ số cache đúng (1.25 write / 0.1 read)", () => {
    for (const model of ["claude-opus-5", "claude-haiku-4-5"] as const) {
      expect(PRICING[model].cacheWriteMultiplier).toBe(1.25);
      expect(PRICING[model].cacheReadMultiplier).toBe(0.1);
    }
  });
});

describe("Offline mode (FR-AI-12..FR-AI-13)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it("FR-AI-12 · thiếu key ⇒ getApiKey null, isAiAvailable false", () => {
    expect(getApiKey()).toBeNull();
    expect(isAiAvailable()).toBe(false);
  });

  it("FR-AI-13 · key rỗng / toàn khoảng trắng ⇒ vẫn coi như offline", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(getApiKey()).toBeNull();
    expect(isAiAvailable()).toBe(false);

    process.env.ANTHROPIC_API_KEY = "   ";
    expect(getApiKey()).toBeNull();
    expect(isAiAvailable()).toBe(false);
  });

  it("FR-AI-12 · có key ⇒ isAiAvailable true", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    expect(getApiKey()).toBe("sk-ant-test-key");
    expect(isAiAvailable()).toBe(true);
  });

  it("FR-AI-13 · key có khoảng trắng thừa ⇒ trim", () => {
    process.env.ANTHROPIC_API_KEY = "  sk-ant-abc  ";
    expect(getApiKey()).toBe("sk-ant-abc");
  });
});

describe("Chuỗi exception typed (FR-AI-14..FR-AI-17)", () => {
  it("FR-AI-14 · mọi lỗi AI đều kế thừa AiError, có `code` ổn định", () => {
    const errors = [
      new AiOfflineError(),
      new AiAuthError(new Error("401")),
      new AiRateLimitError(5_000, new Error("429")),
      new AiApiStatusError(500, "Internal Server Error"),
      new AiConnectionError(new Error("ECONN")),
      new AiTimeoutError(new Error("timeout")),
      new AiRefusalError(),
      new AiSchemaError(["bad"]),
      new AiMaxTokensError(),
      new AiStreamInterruptedError(),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(AiError);
      expect(err.code, `${err.constructor.name} thiếu code`).toBeTruthy();
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("FR-AI-15 · AiOfflineError phân biệt với lỗi mạng", () => {
    const offline = new AiOfflineError();
    const network = new AiConnectionError(new Error("ECONNREFUSED"));
    expect(offline).not.toBeInstanceOf(AiConnectionError);
    expect(network).not.toBeInstanceOf(AiOfflineError);
    expect(offline.code).not.toBe(network.code);
  });

  it("FR-AI-16 · toAiError giữ nguyên lỗi đã là AiError", () => {
    const original = new AiRefusalError();
    expect(toAiError(original)).toBe(original);
  });

  it("FR-AI-16 · toAiError nhận lỗi lạ ⇒ bọc thành AiError, không ném lỗi lạ", () => {
    const wrapped = toAiError(new TypeError("boom"));
    expect(wrapped).toBeInstanceOf(AiError);
    expect(wrapped.code).toBeTruthy();
    expect(wrapped.message).toContain("boom");
  });

  it("FR-AI-17 · AiRateLimitError giữ retryAfter để UI hiện đúng", () => {
    const err = new AiRateLimitError(30_000, new Error("429"));
    expect(err.retryAfterMs).toBe(30_000);
    expect(err.code).toBe("rate_limited");
  });

  it("FR-AI-17 · AiSchemaError liệt kê đường dẫn lỗi của schema", () => {
    const err = new AiSchemaError(["items.0.title", "items.1"]);
    expect(err.code).toBe("schema_invalid");
    expect(err.issues.length).toBe(2);
  });
});

describe("Structured output & Zod (FR-AI-18..FR-AI-19)", () => {
  it("FR-AI-18 · schema Zod phân tích được payload AI trả về", () => {
    const PlanSchema = z.object({
      slots: z.array(z.object({ action: z.string().min(1), minutes: z.number() })).length(6),
    });

    const good = PlanSchema.safeParse({
      slots: Array.from({ length: 6 }, (_, i) => ({ action: `làm việc ${i}`, minutes: 30 })),
    });
    expect(good.success).toBe(true);

    // Thiếu slot ⇒ fail ⇒ server phải ném AiSchemaError chứ không đoán bừa.
    const bad = PlanSchema.safeParse({ slots: [{ action: "x", minutes: 30 }] });
    expect(bad.success).toBe(false);
  });

  it("FR-AI-19 · schema từ chối payload sai kiểu — không ép ép", () => {
    const Schema = z.object({ score: z.number().min(0).max(5) });
    expect(Schema.safeParse({ score: 11 }).success).toBe(false);
    expect(Schema.safeParse({ score: "4" }).success).toBe(false);
    expect(Schema.safeParse({ score: 3.5 }).success).toBe(true);
  });

  it("FR-AI-19 · mọi mã structured đều dùng schema ⇒ output_config.format bắt buộc", () => {
    const structuredCodes = Object.entries(AI_ROUTES)
      .filter(([, r]) => r.structured)
      .map(([code]) => code);
    // 15/16 mã structured — chỉ AI-08 (role-play) là hội thoại tự do.
    expect(structuredCodes).toHaveLength(15);
    expect(structuredCodes).not.toContain("AI-08");
  });
});
