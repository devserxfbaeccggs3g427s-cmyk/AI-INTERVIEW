import { describe, expect, it } from "vitest";

import { mergeStreamedSlot, parseSseChunk } from "@/components/plan/use-plan-stream";
import type { PlanSlotDTO } from "@/lib/daily-loop";

function slot(overrides: Partial<PlanSlotDTO> = {}): PlanSlotDTO {
  return {
    slot: 0,
    domain: "professional",
    kind: "study",
    action: "Học Spring Boot",
    detail: null,
    minutes: 30,
    skillId: null,
    skillName: null,
    done: false,
    source: "ai",
    ...overrides,
  };
}

describe("parseSseChunk", () => {
  it("parse 1 event slot", () => {
    const events = parseSseChunk(
      `data: ${JSON.stringify({ type: "slot", slot: slot() })}\n\n`,
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("slot");
    expect(events[0].slot?.action).toBe("Học Spring Boot");
  });

  it("parse nhiều event trong 1 chunk", () => {
    const events = parseSseChunk(
      `data: ${JSON.stringify({ type: "slot", slot: slot({ slot: 0 }) })}\n\n` +
        `data: ${JSON.stringify({ type: "slot", slot: slot({ slot: 1 }) })}\n\n`,
    );

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.slot?.slot)).toEqual([0, 1]);
  });

  it("parse event done + usage", () => {
    const events = parseSseChunk(
      `data: ${JSON.stringify({
        type: "usage",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cacheRead: 5,
          cacheWrite: 0,
          latencyMs: 120,
          estimatedCost: 0.001,
        },
      })}\n\n` +
        `data: ${JSON.stringify({ type: "done", items: [slot()], source: "ai" })}\n\n`,
    );

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("usage");
    expect(events[0].usage?.cacheRead).toBe(5);
    expect(events[1].type).toBe("done");
    expect(events[1].items).toHaveLength(1);
  });

  it("bỏ qua chunk JSON hỏng — không ném lỗi", () => {
    const events = parseSseChunk("data: {khong hop le\n\n");
    expect(events).toEqual([]);
  });

  it("bỏ qua phần không phải SSE", () => {
    expect(parseSseChunk(": ping\n\n")).toEqual([]);
    expect(parseSseChunk("")).toEqual([]);
  });
});

describe("mergeStreamedSlot", () => {
  it("thêm slot mới và giữ thứ tự theo slot", () => {
    const merged = mergeStreamedSlot([slot({ slot: 1 })], slot({ slot: 0 }));
    expect(merged.map((s) => s.slot)).toEqual([0, 1]);
  });

  it("cập nhật slot chưa xong", () => {
    const current = [slot({ slot: 0, action: "Cũ", minutes: 30 })];
    const merged = mergeStreamedSlot(current, slot({ slot: 0, action: "Mới", minutes: 45 }));

    expect(merged[0].action).toBe("Mới");
    expect(merged[0].minutes).toBe(45);
    expect(merged[0].done).toBe(false);
  });

  it("KHÔNG ghi đè slot đã xong (FR-DL-05 — slot done là bất biến)", () => {
    const current = [slot({ slot: 0, action: "Đã xong", done: true })];
    const merged = mergeStreamedSlot(current, slot({ slot: 0, action: "Stream đề xuất", minutes: 45 }));

    expect(merged[0].action).toBe("Đã xong");
    expect(merged[0].done).toBe(true);
    expect(merged[0].minutes).toBe(30);
  });
});
