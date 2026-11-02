import { describe, expect, it, vi } from "vitest";

/**
 * FR-AF-26 — Đọc env qua 1 chỗ duy nhất, có type, không log giá trị key.
 * FR-AI-06 — Thiếu ANTHROPIC_API_KEY → không crash, chỉ offline mode.
 * FR-AF-25 — Thiếu DATABASE_URL → throw lỗi có hướng dẫn cụ thể.
 */
describe("FR-AF-26 — env.ts (1 chỗ đọc env, mask key, offline mode)", () => {
  it("thiếu DATABASE_URL → throw có hướng dẫn cụ thể", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    await expect(import("@/lib/env")).rejects.toThrow(/DATABASE_URL/);
    await expect(import("@/lib/env")).rejects.toThrow(/\.env\.local/);
  });

  it("thiếu ANTHROPIC_API_KEY → offline mode, KHÔNG throw", async () => {
    vi.resetModules();
    process.env.DATABASE_URL = "file:./env-test.db";
    delete process.env.ANTHROPIC_API_KEY;

    const { env } = await import("@/lib/env");
    expect(env.isOffline).toBe(true);
    expect(env.anthropicApiKey).toBeNull();
    expect(env.maskedKey).toBe("");
  });

  it("có ANTHROPIC_API_KEY → configured, mask đúng sk-ant-…abcd", async () => {
    vi.resetModules();
    process.env.DATABASE_URL = "file:./env-test.db";
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret1234";

    const { env } = await import("@/lib/env");
    expect(env.isOffline).toBe(false);
    expect(env.anthropicApiKey).toBe("sk-ant-secret1234");
    expect(env.maskedKey).toBe("sk-ant-…1234");
    // Key đầy đủ KHÔNG lọt vào maskedKey.
    expect(env.maskedKey).not.toContain("secret");
  });

  it("nodeEnv =", async () => {
    vi.resetModules();
    process.env.DATABASE_URL = "file:./env-test.db";
    delete process.env.ANTHROPIC_API_KEY;
    const { env } = await import("@/lib/env");
    expect(env.nodeEnv).toBe("test");
  });
});