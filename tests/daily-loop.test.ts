import { describe, expect, it } from "vitest";

import {
  clampMinutes,
  computeStreak,
  computeWeeklyEnergy,
  mergeRegeneratedPlan,
  slotContract,
  validateDomainMix,
  type PlanSlotDTO,
} from "@/lib/daily-loop";
import { generateFallbackPlan, prioritizeSkills, type SkillForPlan } from "@/lib/plan";
import { SLOT_DOMAINS } from "@/lib/config";

/* ══ Helpers ══════════════════════════════════════════════════════════════ */

function slot(overrides: Partial<PlanSlotDTO> & { slot: number }): PlanSlotDTO {
  return {
    domain: SLOT_DOMAINS[overrides.slot],
    kind: "study",
    action: `Hành động ${overrides.slot}`,
    detail: null,
    minutes: 20,
    skillId: null,
    skillName: null,
    done: false,
    source: "ai",
    ...overrides,
  };
}

/* ══ Streak (FR-DL-05a) ═══════════════════════════════════════════════════ */

describe("computeStreak — số ngày liên tiếp có hành động thật", () => {
  it("không có hoạt động nào ⇒ 0", () => {
    expect(computeStreak(new Set(), "2026-10-30")).toBe(0);
  });

  it("hôm nay có hoạt động ⇒ tính từ hôm nay", () => {
    expect(computeStreak(new Set(["2026-10-30"]), "2026-10-30")).toBe(1);
  });

  it("3 ngày liên tiếp trước hôm nay ⇒ 3 (không reset giữa ngày)", () => {
    const active = new Set(["2026-10-27", "2026-10-28", "2026-10-29"]);
    expect(computeStreak(active, "2026-10-30")).toBe(3);
  });

  it("hôm nay + 2 ngày trước ⇒ 3", () => {
    const active = new Set(["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(computeStreak(active, "2026-10-30")).toBe(3);
  });

  it("đứt quãng ⇒ dừng ở chuỗi liên tiếp gần nhất", () => {
    const active = new Set(["2026-10-20", "2026-10-28", "2026-10-29"]);
    expect(computeStreak(active, "2026-10-30")).toBe(2);
  });

  it("ngày không liên tiếp bị bỏ qua", () => {
    const active = new Set(["2026-10-26", "2026-10-28"]);
    expect(computeStreak(active, "2026-10-28")).toBe(1);
  });
});

/* ══ Năng lượng tuần (FR-DL-05b) ═══════════════════════════════════════════ */

describe("computeWeeklyEnergy — 0..100% theo slot đã xong", () => {
  it("42 slot, 33 xong ⇒ 79%", () => {
    // AC-DL-4: 33/42 = 78.57 → làm tròn 79
    const days = [
      { date: "2026-10-24", doneSlots: 6, totalSlots: 6 },
      { date: "2026-10-25", doneSlots: 6, totalSlots: 6 },
      { date: "2026-10-26", doneSlots: 6, totalSlots: 6 },
      { date: "2026-10-27", doneSlots: 6, totalSlots: 6 },
      { date: "2026-10-28", doneSlots: 5, totalSlots: 6 },
      { date: "2026-10-29", doneSlots: 4, totalSlots: 6 },
      { date: "2026-10-30", doneSlots: 0, totalSlots: 6 },
    ];

    const energy = computeWeeklyEnergy(days);
    expect(energy.pct).toBe(79);
    expect(energy.doneSlots).toBe(33);
    expect(energy.totalSlots).toBe(42);
    expect(energy.daysWithPlan).toBe(7);
    expect(energy.hasData).toBe(true);
  });

  it("ngày KHÔNG có kế hoạch không tính vào mẫu số", () => {
    const days = [
      { date: "2026-10-29", doneSlots: 3, totalSlots: 3 },
      { date: "2026-10-30", doneSlots: 0, totalSlots: 0 }, // không có kế hoạch
    ];

    const energy = computeWeeklyEnergy(days);
    expect(energy.totalSlots).toBe(3);
    expect(energy.pct).toBe(100);
    expect(energy.daysWithPlan).toBe(1);
  });

  it("chưa có dữ liệu ⇒ hasData false, pct 0 (UI hiện '—')", () => {
    const energy = computeWeeklyEnergy([
      { date: "2026-10-30", doneSlots: 0, totalSlots: 0 },
    ]);
    expect(energy.hasData).toBe(false);
    expect(energy.pct).toBe(0);
    expect(energy.totalSlots).toBe(0);
  });

  it("daysInWindow luôn = 7", () => {
    expect(computeWeeklyEnergy([]).daysInWindow).toBe(7);
  });
});

/* ══ Bất biến domain 4 trục (P5) ═══════════════════════════════════════════ */

describe("validateDomainMix — {1,1,2,2}", () => {
  it("đúng tập ⇒ ok", () => {
    const result = validateDomainMix([
      { domain: "professional" },
      { domain: "communication" },
      { domain: "language" },
      { domain: "language" },
      { domain: "personal" },
      { domain: "personal" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      professional: 1,
      communication: 1,
      language: 2,
      personal: 2,
    });
  });

  it("thiếu 1 personal ⇒ fail", () => {
    const result = validateDomainMix([
      { domain: "professional" },
      { domain: "communication" },
      { domain: "language" },
      { domain: "language" },
      { domain: "personal" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("2 professional ⇒ fail", () => {
    const result = validateDomainMix([
      { domain: "professional" },
      { domain: "professional" },
      { domain: "language" },
      { domain: "language" },
      { domain: "personal" },
      { domain: "personal" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("3 language ⇒ fail", () => {
    const result = validateDomainMix([
      { domain: "professional" },
      { domain: "communication" },
      { domain: "language" },
      { domain: "language" },
      { domain: "language" },
      { domain: "personal" },
    ]);
    expect(result.ok).toBe(false);
  });
});

/* ══ Merge khi sinh lại (FR-DL-06, AC-DL-3) ═══════════════════════════════ */

describe("mergeRegeneratedPlan — slot đã xong là bất biến", () => {
  it("slot done giữ nguyên 100%", () => {
    const existing = [
      slot({ slot: 0, done: true, action: "Đã xong rồi", minutes: 35, skillId: "s1" }),
      slot({ slot: 1, action: "Slot mở" }),
    ];

    const incoming = [
      slot({ slot: 0, action: "AI đề xuất lại", minutes: 40, skillId: "s2" }),
      slot({ slot: 1, action: "AI nội dung mới", minutes: 25 }),
    ];

    const { merged, keptDone } = mergeRegeneratedPlan(existing, incoming);

    expect(keptDone).toBe(1);
    expect(merged[0].done).toBe(true);
    expect(merged[0].action).toBe("Đã xong rồi");
    expect(merged[0].minutes).toBe(35);
    expect(merged[0].skillId).toBe("s1");
  });

  it("slot mở lấy nội dung mới", () => {
    const existing = [slot({ slot: 0 }), slot({ slot: 1, action: "Cũ" })];
    const incoming = [slot({ slot: 0 }), slot({ slot: 1, action: "Mới", minutes: 30 })];

    const { merged, changedSlots } = mergeRegeneratedPlan(existing, incoming);

    expect(merged[1].action).toBe("Mới");
    expect(merged[1].minutes).toBe(30);
    expect(changedSlots).toBe(1);
  });

  it("incoming thiếu slot ⇒ giữ slot cũ (không xoá)", () => {
    const existing = [slot({ slot: 0 }), slot({ slot: 1, action: "Giữ" })];
    const incoming = [slot({ slot: 0, action: "Mới" })];

    const { merged } = mergeRegeneratedPlan(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[1].action).toBe("Giữ");
  });

  it("không mutate input", () => {
    const existing = [slot({ slot: 0 })];
    const incoming = [slot({ slot: 0, action: "Mới" })];
    const before = JSON.stringify(existing);

    mergeRegeneratedPlan(existing, incoming);
    expect(JSON.stringify(existing)).toBe(before);
  });

  it("incoming rỗng ⇒ trả về existing nguyên trạng", () => {
    const existing = [slot({ slot: 0, action: "A" })];
    const { merged, keptDone, changedSlots } = mergeRegeneratedPlan(existing, []);

    expect(merged).toHaveLength(1);
    expect(merged[0].action).toBe("A");
    expect(keptDone).toBe(0);
    expect(changedSlots).toBe(0);
  });
});

/* ══ Hợp đồng slot (FR-DL-SLOT-02, -03) ════════════════════════════════════ */

describe("slotContract — domain & khoảng phút cố định theo vị trí", () => {
  it("slot 0 = professional, 25–45 phút", () => {
    const contract = slotContract(0);
    expect(contract.domain).toBe("professional");
    expect(contract.minMinutes).toBe(25);
    expect(contract.maxMinutes).toBe(45);
  });

  it("slot 2 = language (SRS), 10–20 phút", () => {
    const contract = slotContract(2);
    expect(contract.domain).toBe("language");
    expect(contract.kind).toBe("srs");
    expect(contract.minMinutes).toBe(10);
    expect(contract.maxMinutes).toBe(20);
  });

  it("slot 5 = personal (thể chất), 15–30 phút", () => {
    const contract = slotContract(5);
    expect(contract.domain).toBe("personal");
    expect(contract.minMinutes).toBe(15);
    expect(contract.maxMinutes).toBe(30);
  });

  it("clamp minutes về khoảng hợp lệ", () => {
    expect(clampMinutes(0, 10)).toBe(25);
    expect(clampMinutes(0, 90)).toBe(45);
    expect(clampMinutes(4, 100)).toBe(10);
    expect(clampMinutes(4, 7)).toBe(7);
  });
});

/* ══ Bộ sinh offline (FR-DL-SLOT-05, AC-DL-2) ══════════════════════════════ */

describe("generateFallbackPlan — luôn ra đúng 6 slot", () => {
  const skills: SkillForPlan[] = [
    { id: "s1", name: "Java Core", domain: "professional", level: 0, evidenceCount: 0 },
    { id: "s2", name: "Spring Boot", domain: "professional", level: 2, evidenceCount: 5 },
    { id: "s3", name: "Nói", domain: "communication", level: 1, evidenceCount: 2 },
    { id: "s4", name: "Tiếng Trung", domain: "language", level: 0, evidenceCount: 0 },
    { id: "s5", name: "Tiếng Anh", domain: "language", level: 0, evidenceCount: 0 },
    { id: "s6", name: "Nhật ký", domain: "personal", level: 0, evidenceCount: 0 },
  ];

  it("ra đúng 6 slot, slot 0..5", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    expect(plan).toHaveLength(6);
    expect(plan.map((i) => i.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("domain đúng theo vị trí", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    expect(plan.map((i) => i.domain)).toEqual([...SLOT_DOMAINS]);
  });

  it("mọi item có source = fallback", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    expect(plan.every((i) => i.source === "fallback")).toBe(true);
  });

  it("tiêu đề lấy từ tên kỹ năng", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    expect(plan[0].action).toBe("Java Core");
  });

  it("phút nằm trong khoảng của slot", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    for (const item of plan) {
      const contract = slotContract(item.slot);
      expect(item.minutes).toBeGreaterThanOrEqual(contract.minMinutes);
      expect(item.minutes).toBeLessThanOrEqual(contract.maxMinutes);
    }
  });

  it("không có kỹ năng nào ⇒ vẫn ra đủ 6 slot", () => {
    const plan = generateFallbackPlan([], { date: new Date(2026, 9, 30) });
    expect(plan).toHaveLength(6);
    expect(plan.every((i) => i.skillId === null)).toBe(true);
    expect(plan[0].action.length).toBeGreaterThan(0);
  });

  it("deterministic: cùng ngày ⇒ kết quả giống hệt", () => {
    const date = new Date(2026, 9, 30);
    const a = generateFallbackPlan(skills, { date });
    const b = generateFallbackPlan(skills, { date });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("khác ngày ⇒ có thể khác (xoay vòng), nhưng vẫn ưu tiên mức thấp", () => {
    const day1 = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    const day2 = generateFallbackPlan(skills, { date: new Date(2026, 9, 31) });
    // Không assert khác nhau (có thể trùng) — assert vẫn hợp lệ.
    expect(day1).toHaveLength(6);
    expect(day2).toHaveLength(6);
    // Kỹ năng mức thấp luôn được ưu tiên ở slot professional.
    expect(day1[0].action).toBe("Java Core");
    expect(day2[0].action).toBe("Java Core");
  });

  it("slot language (2,3) lấy 2 kỹ năng khác nhau", () => {
    const plan = generateFallbackPlan(skills, { date: new Date(2026, 9, 30) });
    expect(plan[2].skillName).not.toBe(plan[3].skillName);
  });
});

describe("prioritizeSkills — level thấp → ít bằng chứng", () => {
  it("sắp xếp theo level rồi evidence rồi id", () => {
    const sorted = prioritizeSkills([
      { id: "b", name: "B", domain: "professional", level: 2, evidenceCount: 0 },
      { id: "a", name: "A", domain: "professional", level: 0, evidenceCount: 5 },
      { id: "c", name: "C", domain: "professional", level: 0, evidenceCount: 1 },
    ]);

    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("không mutate input", () => {
    const input = [
      { id: "b", name: "B", domain: "professional" as const, level: 2, evidenceCount: 0 },
      { id: "a", name: "A", domain: "professional" as const, level: 0, evidenceCount: 0 },
    ];
    const before = input.map((s) => s.id);
    prioritizeSkills(input);
    expect(input.map((s) => s.id)).toEqual(before);
  });
});
