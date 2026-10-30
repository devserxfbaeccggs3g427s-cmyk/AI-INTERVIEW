/**
 * Test bộ sinh kế hoạch cục bộ — `src/lib/plan.ts` (tasks.md 4.10).
 *
 * 🔑 Hợp đồng cấu trúc (SPEC.md §2.1 · FR-AI-06):
 *   - Luôn **đúng 6 slot**, slot 0..5 đúng thứ tự.
 *   - `domain` của mỗi slot khớp `SLOT_TEMPLATE` — AI **không được** đổi domain.
 *   - `normalizePlanSlots` là lưới an toàn cho output của AI: bỏ slot thừa,
 *     điền slot thiếu, clamp `minutes` ≤ 60.
 */

import { describe, expect, it } from "vitest";
import {
  generateLocalPlan,
  normalizePlanSlots,
  pickWeakestSkill,
  SLOT_TEMPLATE,
  type LocalPlanContext,
} from "@/lib/plan";
import { SLOT_COUNT } from "@/lib/types";

/** Ngữ cảnh tối thiểu để sinh kế hoạch. */
function makeContext(overrides: Partial<LocalPlanContext> = {}): LocalPlanContext {
  return {
    date: new Date(2026, 9, 29, 12, 0, 0),
    skills: [
      { id: "s-pro", name: "System Design", level: 1, targetLevel: 3, domain: "professional" },
      { id: "s-com", name: "Viết", level: 0, targetLevel: 3, domain: "communication" },
      { id: "s-lang", name: "Tiếng Anh", level: 0, targetLevel: 3, domain: "language" },
    ],
    dueCards: 12,
    streak: 3,
    lastWeekCompletion: 0.8,
    ...overrides,
  };
}

/**
 * Skill **yếu nhất** = thiếu bằng chứng nhiều nhất so với `targetLevel`
 * (tức `targetLevel - level` lớn nhất), hoà gap thì ưu tiên level thấp hơn.
 *
 * Với `makeContext()`: cả 3 skill đều gap 2, nên skill level 0 được ưu tiên.
 */
const WEAKEST_ID = "s-com";

describe("SLOT_TEMPLATE", () => {
  it("có đúng 6 slot, slot 0..5 liên tục", () => {
    expect(SLOT_TEMPLATE).toHaveLength(SLOT_COUNT);
    expect(SLOT_TEMPLATE.map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("domain khớp đặc tả SPEC §2.1", () => {
    expect(SLOT_TEMPLATE.map((t) => t.domain)).toEqual([
      "professional",
      "communication",
      "language",
      "language",
      "personal",
      "personal",
    ]);
  });

  it("mỗi slot có minMinutes ≤ maxMinutes", () => {
    for (const t of SLOT_TEMPLATE) {
      expect(t.minMinutes).toBeLessThanOrEqual(t.maxMinutes);
    }
  });
});

describe("generateLocalPlan", () => {
  it("luôn trả đúng 6 slot", () => {
    const plan = generateLocalPlan(makeContext());
    expect(plan).toHaveLength(6);
  });

  it("slot 0..5 đúng thứ tự", () => {
    const plan = generateLocalPlan(makeContext());
    expect(plan.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("domain của từng slot khớp SLOT_TEMPLATE", () => {
    const plan = generateLocalPlan(makeContext());
    plan.forEach((p, i) => {
      expect(p.domain).toBe(SLOT_TEMPLATE[i]?.domain);
    });
  });

  it("không có slot nào vượt quá 60 phút", () => {
    const plan = generateLocalPlan(makeContext());
    for (const p of plan) {
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.minutes).toBeLessThanOrEqual(60);
    }
  });

  it("minutes nằm trong khoảng min..max của template (trừ khi giảm tải)", () => {
    const plan = generateLocalPlan(makeContext());
    plan.forEach((p, i) => {
      const t = SLOT_TEMPLATE[i];
      if (!t) return;
      expect(p.minutes).toBeGreaterThanOrEqual(t.minMinutes);
      expect(p.minutes).toBeLessThanOrEqual(t.maxMinutes);
    });
  });

  it("slot 0 gắn skill yếu nhất và nêu tên trong action", () => {
    const plan = generateLocalPlan(makeContext());
    const slot0 = plan[0];
    expect(slot0?.skillId).toBe(WEAKEST_ID);
    expect(slot0?.action).toContain("Viết");
  });

  it("skill yếu nhất theo gap lớn nhất được ưu tiên", () => {
    const plan = generateLocalPlan(
      makeContext({
        skills: [
          { id: "s-a", name: "A", level: 3, targetLevel: 3, domain: "professional" },
          { id: "s-b", name: "B", level: 0, targetLevel: 3, domain: "professional" },
        ],
      }),
    );
    expect(plan[0]?.skillId).toBe("s-b");
  });

  it("slot 1 gắn skill communication, slot 2/3 gắn skill language", () => {
    const plan = generateLocalPlan(makeContext());
    expect(plan[1]?.skillId).toBe("s-com");
    expect(plan[2]?.skillId).toBe("s-lang");
    expect(plan[3]?.skillId).toBe("s-lang");
  });

  it("slot 2 nhắc số thẻ đến hạn (tối đa 20)", () => {
    const plan = generateLocalPlan(makeContext({ dueCards: 12 }));
    expect(plan[2]?.detail).toContain("12");

    const capped = generateLocalPlan(makeContext({ dueCards: 500 }));
    expect(capped[2]?.detail).toContain("20");
  });

  it("slot 2 khi không có thẻ đến hạn thì hướng dẫn ôn chủ động", () => {
    const plan = generateLocalPlan(makeContext({ dueCards: 0 }));
    expect(plan[2]?.detail).toContain("ngẫu nhiên");
  });

  it("mọi slot chưa xong và nguồn là 'fallback' (không có AI)", () => {
    const plan = generateLocalPlan(makeContext());
    for (const p of plan) {
      expect(p.done).toBe(false);
      expect(p.source).toBe("fallback");
    }
  });

  it("reduceLoad làm giảm minutes nhưng vẫn ≥ 5 phút", () => {
    const plan = generateLocalPlan(makeContext({ reduceLoad: true }));
    for (const p of plan) {
      expect(p.minutes).toBeGreaterThanOrEqual(5);
      expect(p.minutes).toBeLessThanOrEqual(60);
    }
  });

  it("vẫn trả 6 slot khi không có skill nào", () => {
    const plan = generateLocalPlan(makeContext({ skills: [] }));
    expect(plan).toHaveLength(6);
    expect(plan[0]?.skillId).toBeNull();
    expect(plan[0]?.detail).toBeNull();
  });
});

describe("pickWeakestSkill", () => {
  it("trả undefined khi danh sách rỗng", () => {
    expect(pickWeakestSkill([])).toBeUndefined();
  });

  it("chọn skill thiếu bằng chứng nhiều nhất (gap target-level lớn nhất)", () => {
    const skills = [
      { id: "a", name: "A", level: 3, targetLevel: 3 },
      { id: "b", name: "B", level: 0, targetLevel: 3 },
      { id: "c", name: "C", level: 2, targetLevel: 3 },
    ];
    expect(pickWeakestSkill(skills)?.id).toBe("b");
  });

  it("hoà gap → ưu tiên level thấp hơn", () => {
    const skills = [
      { id: "a", name: "A", level: 2, targetLevel: 3 },
      { id: "b", name: "B", level: 1, targetLevel: 3 },
    ];
    expect(pickWeakestSkill(skills)?.id).toBe("b");
  });

  it("không mutate mảng input", () => {
    const skills = [
      { id: "a", name: "A", level: 3, targetLevel: 3 },
      { id: "b", name: "B", level: 0, targetLevel: 3 },
    ];
    const order = skills.map((s) => s.id);
    pickWeakestSkill(skills);
    expect(skills.map((s) => s.id)).toEqual(order);
  });
});

describe("normalizePlanSlots", () => {
  it("luôn trả đúng 6 slot", () => {
    expect(normalizePlanSlots([])).toHaveLength(6);
    expect(normalizePlanSlots([]).map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("giữ domain gốc của template (AI không được đổi domain)", () => {
    const raw = [
      { slot: 0, domain: "personal" as const, action: "Đọc sách", minutes: 30 },
      { slot: 1, domain: "professional" as const, action: "Code", minutes: 20 },
    ];
    const out = normalizePlanSlots(raw);
    expect(out[0]?.domain).toBe("professional");
    expect(out[1]?.domain).toBe("communication");
  });

  it("giữ action của AI khi có, kèm domain theo template", () => {
    const raw = [{ slot: 0, action: "Đọc sách", minutes: 30 }];
    const out = normalizePlanSlots(raw);
    expect(out[0]?.action).toBe("Đọc sách");
  });

  it("bỏ slot thừa (slot >= 6 hoặc slot âm)", () => {
    const raw = [
      { slot: 9, action: "Thừa" },
      { slot: -1, action: "Thừa" },
      { slot: 0, action: "Hợp lệ" },
    ];
    const out = normalizePlanSlots(raw);
    expect(out).toHaveLength(6);
    expect(out.some((p) => p.action === "Thừa")).toBe(false);
  });

  it("bỏ item không có `slot` là số", () => {
    const out = normalizePlanSlots([
      { action: "Không có slot" } as { slot?: number; action?: string },
      { slot: 2, action: "Ôn thẻ" },
    ]);
    expect(out).toHaveLength(6);
    expect(out[2]?.action).toBe("Ôn thẻ");
  });

  it("điền slot thiếu bằng nội dung mặc định của template", () => {
    const out = normalizePlanSlots([{ slot: 0, action: "Học System Design" }]);
    expect(out[1]?.action).toBe(SLOT_TEMPLATE[1]?.content);
    expect(out[4]?.action).toBe(SLOT_TEMPLATE[4]?.content);
  });

  it("clamp minutes về ≤ 60", () => {
    const out = normalizePlanSlots([
      { slot: 0, action: "X", minutes: 600 },
      { slot: 1, action: "Y", minutes: 90 },
    ]);
    expect(out[0]?.minutes).toBe(60);
    expect(out[1]?.minutes).toBe(60);
  });

  it("minutes thiếu / <= 0 → dùng trung bình min..max của template", () => {
    const out = normalizePlanSlots([
      { slot: 0, action: "X", minutes: 0 },
      { slot: 1, action: "Y" },
    ]);
    const t0 = SLOT_TEMPLATE[0];
    const t1 = SLOT_TEMPLATE[1];
    if (t0) expect(out[0]?.minutes).toBe(Math.round((t0.minMinutes + t0.maxMinutes) / 2));
    if (t1) expect(out[1]?.minutes).toBe(Math.round((t1.minMinutes + t1.maxMinutes) / 2));
  });

  it("round minutes và luôn > 0", () => {
    const out = normalizePlanSlots([{ slot: 0, action: "X", minutes: 12.6 }]);
    expect(out[0]?.minutes).toBe(13);
    for (const p of out) {
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.minutes).toBeLessThanOrEqual(60);
    }
  });

  it("detail rỗng → null, action rỗng → nội dung mặc định", () => {
    const out = normalizePlanSlots([{ slot: 0, action: "   ", detail: "  " }]);
    expect(out[0]?.action).toBe(SLOT_TEMPLATE[0]?.content);
    expect(out[0]?.detail).toBeNull();
  });

  it("mọi slot đều done = false (AI không được tự đánh dấu xong)", () => {
    const out = normalizePlanSlots([{ slot: 0, action: "X", done: true } as never]);
    for (const p of out) {
      expect(p.done).toBe(false);
    }
  });

  it("slot trùng nhau → giữ slot sau cùng", () => {
    const out = normalizePlanSlots([
      { slot: 0, action: "Cũ" },
      { slot: 0, action: "Mới" },
    ]);
    expect(out[0]?.action).toBe("Mới");
  });
});
