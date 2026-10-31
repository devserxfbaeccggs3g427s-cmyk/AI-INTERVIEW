import { describe, expect, it } from "vitest";

import {
  DEFAULT_VELOCITY,
  resolveCurrentStage,
  shouldReduceLoad,
  STAGES,
} from "@/lib/stages";

describe("lộ trình 3 giai đoạn (Q4, FR-DL-09..11)", () => {
  it("có đúng 3 giai đoạn, điều kiện tăng dần", () => {
    expect(STAGES).toHaveLength(3);
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("mỗi giai đoạn có điều kiện + tiêu chí đo được (P7)", () => {
    for (const stage of STAGES) {
      expect(stage.criteria.condition.length).toBeGreaterThan(0);
      expect(stage.criteria.criteria.length).toBeGreaterThan(0);
    }
  });

  it("chưa có bằng chứng ⇒ giai đoạn 1", () => {
    const progress = resolveCurrentStage(0, null);
    expect(progress.stage.id).toBe(1);
    expect(progress.pct).toBe(0);
  });

  it("25 Evidence + chưa có mock interview ⇒ giai đoạn 1 đạt, hiện giai đoạn 2", () => {
    // 25 Evidence ≥ 20 ⇒ điều kiện evidence của giai đoạn 1 đạt,
    // nhưng giai đoạn 2 cần mock interview ≥ 3.5 → chưa có ⇒ vẫn giai đoạn 2.
    const progress = resolveCurrentStage(25, null);
    expect(progress.stage.id).toBe(2);
    expect(progress.evidenceCount).toBe(25);
  });

  it("25 Evidence + mock interview 4.0 ⇒ giai đoạn 3", () => {
    const progress = resolveCurrentStage(25, 4.0);
    expect(progress.stage.id).toBe(3);
  });

  it("25 Evidence + mock interview 3.5 (đúng ngưỡng) ⇒ giai đoạn 3", () => {
    const progress = resolveCurrentStage(25, 3.5);
    expect(progress.stage.id).toBe(3);
  });

  it("25 Evidence + mock interview 3.4 (dưới ngưỡng) ⇒ giai đoạn 2", () => {
    const progress = resolveCurrentStage(25, 3.4);
    expect(progress.stage.id).toBe(2);
  });

  it("đạt cả 3 giai đoạn ⇒ pct = 100", () => {
    const progress = resolveCurrentStage(100, 5);
    expect(progress.pct).toBe(100);
  });

  it("chưa có ≥7 ngày dữ liệu ⇒ velocity mặc định 1 Evidence/ngày", () => {
    const progress = resolveCurrentStage(10, null, 3, 3);
    expect(progress.velocity).toBe(DEFAULT_VELOCITY);
    expect(progress.hasVelocityData).toBe(false);
  });

  it("≥7 ngày dữ liệu ⇒ velocity tính từ số Evidence thật", () => {
    const progress = resolveCurrentStage(10, null, 14, 7);
    expect(progress.velocity).toBe(2);
    expect(progress.hasVelocityData).toBe(true);
  });

  it("giảm tải khi trượt ≥2 ngày (FR-DL-11)", () => {
    expect(shouldReduceLoad(0)).toBe(false);
    expect(shouldReduceLoad(1)).toBe(false);
    expect(shouldReduceLoad(2)).toBe(true);
    expect(shouldReduceLoad(5)).toBe(true);
  });

  it("tiến độ là 0..100", () => {
    for (const count of [0, 5, 10, 19, 20, 25, 100]) {
      const progress = resolveCurrentStage(count, null);
      expect(progress.pct).toBeGreaterThanOrEqual(0);
      expect(progress.pct).toBeLessThanOrEqual(100);
    }
  });
});
