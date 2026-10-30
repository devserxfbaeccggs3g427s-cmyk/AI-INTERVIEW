/**
 * Unit test cho AI Router (tasks.md 2.12 · AC-7b · design.md §6.1 / §6.2).
 *
 * AC-7b yêu cầu 3 điều:
 *   1. `route("classify")` → `{provider:"local"}`.
 *   2. `route("grading")` → `{provider:"anthropic"}`.
 *   3. Anthropic lỗi → fallback sang local → `AiCall{provider:"local", fallbackFrom:"anthropic"}`.
 *
 * Test **không** chạm mạng thật: cả client Anthropic lẫn client Ollama đều
 * được mock (`vi.mock`), nên test chạy được offline và không tốn tiền.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callAnthropicDetailed: vi.fn(),
  callLocal: vi.fn(),
  writeAiCall: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    callAnthropicDetailed: mocks.callAnthropicDetailed,
    writeAiCall: mocks.writeAiCall,
  };
});

vi.mock("@/lib/ai/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama")>();
  return {
    ...actual,
    callLocal: mocks.callLocal,
  };
});

import {
  ANTHROPIC_TASKS,
  LOCAL_TASKS,
  NON_AI_TASKS,
  ROUTES,
  callAi,
  isAiFreeTask,
  route,
} from "@/lib/ai/router";

beforeEach(() => {
  vi.clearAllMocks();
  // Router chỉ gọi cloud khi có key — test giả lập key để đi qua nhánh Anthropic.
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
});

/**
 * Hoàn tác `vi.stubEnv` sau mỗi test.
 *
 * Bắt buộc: `vitest.config.ts` chạy `pool: "forks", singleFork: true` → các
 * test file dùng chung 1 process. Nếu `ANTHROPIC_API_KEY` giả lập còn sót,
 * `tests/integration/cache.test.ts` sẽ tưởng có key thật → gọi API thật và
 * tốn tiền. `vi.unstubAllEnvs()` trả env về trạng thái ban đầu.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("route() — bảng định tuyến (design.md §6.1)", () => {
  it('route("classify") → {provider:"local"}', () => {
    const r = route("classify");
    expect(r.provider).toBe("local");
    expect(r.model).toBe("qwen2.5:7b");
    expect(r.effort).toBe("low");
  });

  it('route("grading") → {provider:"anthropic"}', () => {
    const r = route("grading");
    expect(r.provider).toBe("anthropic");
    expect(r.model).toBe("claude-opus-5");
    expect(r.effort).toBe("medium");
  });

  it("mọi route đều trả đủ 3 trường", () => {
    for (const task of Object.keys(ROUTES) as Array<keyof typeof ROUTES>) {
      const r = route(task);
      expect(typeof r.provider).toBe("string");
      expect(r.model.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(r.effort);
    }
  });

  it("nhóm local đúng 7 task, nhóm anthropic đúng 10 task (design.md §6.9)", () => {
    expect(LOCAL_TASKS).toHaveLength(7);
    expect(ANTHROPIC_TASKS).toHaveLength(10);
    expect(LOCAL_TASKS).toEqual(
      expect.arrayContaining([
        "autofill",
        "classify",
        "language_correct",
        "language_level",
        "test_from_content",
        "biometric_correlate",
        "mock_next_question",
      ]),
    );
    expect(ANTHROPIC_TASKS).toEqual(
      expect.arrayContaining([
        "daily_plan",
        "grading",
        "journal_feedback",
        "weekly_review",
        "roleplay",
        "language_cards",
        "mock_interview",
        "mock_interview_turn",
        "mock_interview_report",
        "language_test_grade",
      ]),
    );
  });

  it("task không gọi AI là `test_blueprint` (AI-14)", () => {
    expect(NON_AI_TASKS).toEqual(["test_blueprint"]);
    expect(isAiFreeTask("test_blueprint")).toBe(true);
    expect(isAiFreeTask("grading")).toBe(false);
  });
});

describe("callAi() — fallback chain anthropic → local (AC-7b)", () => {
  it("anthropic lỗi → fallback sang local → AiCall{provider:'local', fallbackFrom:'anthropic'}", async () => {
    mocks.callAnthropicDetailed.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.callLocal.mockResolvedValueOnce({ slots: [] });

    const envelope = await callAi("daily_plan", {
      system: "system cố định",
      user: "user message",
    });

    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;

    // Provider thật đã trả lời là local, và `fallbackFrom` = provider gốc.
    expect(envelope.meta.provider).toBe("local");
    expect(envelope.meta.fallbackFrom).toBe("anthropic");

    // Đúng 1 dòng `AiCall`, provider = local, fallbackFrom = anthropic.
    expect(mocks.writeAiCall).toHaveBeenCalledTimes(1);
    const record = mocks.writeAiCall.mock.calls[0]?.[0] as {
      provider: string;
      fallbackFrom: string | null;
      ok: boolean;
    };
    expect(record.provider).toBe("local");
    expect(record.fallbackFrom).toBe("anthropic");
    expect(record.ok).toBe(true);
  });

  it("provider local luôn có chi phí 0 (AC-15)", async () => {
    mocks.callLocal.mockResolvedValueOnce({ ok: 1 });

    await callAi("classify", { system: "s", user: "u" });

    const record = mocks.writeAiCall.mock.calls[0]?.[0] as { estimatedCost: number };
    expect(record.estimatedCost).toBe(0);
  });

  it("anthropic thành công → không fallback, ghi provider='anthropic'", async () => {
    mocks.callAnthropicDetailed.mockResolvedValueOnce({
      data: { slots: [] },
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0.0048,
        latencyMs: 900,
      },
    });

    const envelope = await callAi("daily_plan", { system: "s", user: "u" });

    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;
    expect(envelope.meta.provider).toBe("anthropic");
    expect(envelope.meta.fallbackFrom).toBeNull();
    expect(mocks.callLocal).not.toHaveBeenCalled();

    const record = mocks.writeAiCall.mock.calls[0]?.[0] as {
      provider: string;
      inputTokens: number;
      cacheRead: number;
    };
    expect(record.provider).toBe("anthropic");
    expect(record.inputTokens).toBe(120);
  });

  it("cả 2 provider lỗi → trả {ok:false, error:{code,message}}, KHÔNG throw ra ngoài", async () => {
    mocks.callAnthropicDetailed.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    const envelope = await callAi("journal_feedback", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(typeof envelope.error.code).toBe("string");
    expect(envelope.error.code.length).toBeGreaterThan(0);
    expect(envelope.error.message.length).toBeGreaterThan(0);
  });

  it("task không gọi AI → không gọi mạng, trả lỗi có kiểu", async () => {
    const envelope = await callAi("test_blueprint", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe("unavailable");
    expect(mocks.callAnthropicDetailed).not.toHaveBeenCalled();
    expect(mocks.callLocal).not.toHaveBeenCalled();
  });

  it("thiếu API key → fallback sang local nếu task hỗ trợ", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mocks.callLocal.mockResolvedValueOnce({ ok: 1 });

    const envelope = await callAi("daily_plan", { system: "s", user: "u" });

    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;
    expect(envelope.meta.provider).toBe("local");
    expect(envelope.meta.fallbackFrom).toBe("anthropic");
  });
});

describe("callAi() — mã lỗi ổn định cho UI (design.md §7.2)", () => {
  it("Ollama chết → code 'ollama_down' (không phải 'no_api_key')", async () => {
    const { AiUnavailableError } = await import("@/lib/errors");
    mocks.callLocal.mockRejectedValueOnce(
      new AiUnavailableError("Không kết nối được Ollama.", "ollama_down"),
    );

    const envelope = await callAi("classify", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe("ollama_down");
  });

  it("thiếu API key → code 'no_api_key'", async () => {
    const { AiUnavailableError } = await import("@/lib/errors");
    mocks.callAnthropicDetailed.mockRejectedValueOnce(
      new AiUnavailableError("Chưa cấu hình Anthropic API key.", "no_api_key"),
    );
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    const envelope = await callAi("daily_plan", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe("no_api_key");
  });

  it("AI từ chối → code 'refusal' (AC-8: trả {ok:false}, không 500)", async () => {
    const { AiRefusalError } = await import("@/lib/errors");
    mocks.callAnthropicDetailed.mockRejectedValueOnce(
      new AiRefusalError("AI không thể xử lý nội dung này.", "refusal"),
    );
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    const envelope = await callAi("journal_feedback", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe("refusal");
  });

  it("response lệch schema → code 'schema'", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mocks.callAnthropicDetailed.mockRejectedValueOnce(
      new ValidationError("Cấu trúc không khớp schema.", ["slots: expected array"]),
    );
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    const envelope = await callAi("daily_plan", { system: "s", user: "u" });

    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe("schema");
  });

  it("lượt gọi thất bại vẫn ghi 1 dòng AiCall{ok:false, error:<mã>}", async () => {
    const { AiRefusalError } = await import("@/lib/errors");
    mocks.callAnthropicDetailed.mockRejectedValueOnce(
      new AiRefusalError("AI không thể xử lý nội dung này.", "refusal"),
    );
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    await callAi("journal_feedback", { system: "s", user: "u" });

    const record = mocks.writeAiCall.mock.calls[0]?.[0] as {
      ok: boolean;
      error: string | null;
    };
    expect(record.ok).toBe(false);
    expect(record.error).toBe("refusal");
  });
});

describe("callAi() — bước 3 fallback rule cục bộ (design.md §6.2)", () => {
  it("daily_plan: anthropic lỗi + Ollama lỗi → rule cục bộ sinh 6 slot", async () => {
    mocks.callAnthropicDetailed.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.callLocal.mockRejectedValueOnce(new Error("Ollama down"));

    const localContext = {
      date: new Date("2026-10-29T00:00:00.000Z"),
      skills: [{ id: "s1", name: "React", level: 1, targetLevel: 3, domain: "professional" }],
      dueCards: 3,
      streak: 2,
      lastWeekCompletion: 0.5,
    };

    const envelope = await callAi("daily_plan", {
      system: "s",
      user: "u",
      localContext,
    });

    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;
    expect(envelope.meta.provider).toBe("local");
    expect(envelope.meta.model).toBe("rule-cục-bộ");
    expect(envelope.meta.fallbackFrom).toBe("anthropic");

    const slots = envelope.data as Array<{ slot: number }>;
    expect(slots).toHaveLength(6);
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
