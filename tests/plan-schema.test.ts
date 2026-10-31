import { describe, expect, it } from "vitest";

import { buildPlanSchema, PLAN_SLOT_CONTRACT_V1, PLAN_SYSTEM_V1 } from "@/lib/prompts";
import { SLOT_DOMAINS } from "@/lib/config";

/**
 * Payload hợp lệ — 6 slot, domain đúng vị trí, phút trong khoảng.
 */
function validPayload() {
  const minutesBySlot = [35, 20, 15, 20, 8, 20];
  return {
    slots: SLOT_DOMAINS.map((domain, slot) => ({
      slot,
      domain,
      action: `Hành động ${slot}`,
      detail: `Chi tiết ${slot}`,
      minutes: minutesBySlot[slot],
      skillName: slot === 4 ? null : `Kỹ năng ${slot}`,
    })),
  };
}

describe("PlanSchema — 6 slot cố định (FR-DL-SLOT-01..03)", () => {
  const schema = buildPlanSchema();

  it("payload hợp lệ parse thành công", () => {
    const result = schema.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("payload 5 slot ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots.pop();
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("payload trùng slot ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[3].slot = 2;
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("domain của slot 2 đổi sang professional ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[2].domain = "professional";
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("slot 5 đổi domain ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[5].domain = "professional";
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("action rỗng ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[0].action = "";
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("detail dài hơn 120 ký tự ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[0].detail = "x".repeat(121);
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("minutes ngoài khoảng 5..90 ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[0].minutes = 200;
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("slot ngoài 0..5 ⇒ parse fail", () => {
    const payload = validPayload();
    payload.slots[0].slot = 6;
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("skillName null vẫn hợp lệ (slot personal)", () => {
    const payload = validPayload();
    payload.slots[4].skillName = null;
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("custom slotDomains vẫn dùng được", () => {
    const custom = buildPlanSchema({ slotDomains: SLOT_DOMAINS });
    expect(custom.safeParse(validPayload()).success).toBe(true);
  });
});

describe("prompt caching — system prompt không chứa dữ liệu biến động", () => {
  it("PLAN_SYSTEM_V1 không chứa ngày / UUID / Date.now() / aiTone", () => {
    // ISO date
    expect(PLAN_SYSTEM_V1).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // UUID
    expect(PLAN_SYSTEM_V1).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // Biến động runtime
    expect(PLAN_SYSTEM_V1).not.toContain("Date.now()");
    expect(PLAN_SYSTEM_V1).not.toContain("new Date");
    // Dữ liệu người dùng
    expect(PLAN_SYSTEM_V1.toLowerCase()).not.toContain("aitone");
    expect(PLAN_SYSTEM_V1).not.toContain("ANTHROPIC_API_KEY");
  });

  it("PLAN_SLOT_CONTRACT_V1 không chứa dữ liệu biến động", () => {
    expect(PLAN_SLOT_CONTRACT_V1).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(PLAN_SLOT_CONTRACT_V1).not.toContain("Date.now()");
    expect(PLAN_SLOT_CONTRACT_V1).not.toContain("aiTone");
  });

  it("cả 2 hằng số là hằng (gọi 2 lần cho kết quả giống hệt)", () => {
    expect(PLAN_SYSTEM_V1).toBe(PLAN_SYSTEM_V1);
    expect(PLAN_SLOT_CONTRACT_V1).toBe(PLAN_SLOT_CONTRACT_V1);
  });

  it("hợp đồng slot liệt kê đủ 6 slot với khoảng phút", () => {
    for (let slot = 0; slot < 6; slot++) {
      expect(PLAN_SLOT_CONTRACT_V1).toContain(`Slot ${slot}`);
    }
    expect(PLAN_SLOT_CONTRACT_V1).toContain("25–45 phút");
    expect(PLAN_SLOT_CONTRACT_V1).toContain("5–10 phút");
  });
});
