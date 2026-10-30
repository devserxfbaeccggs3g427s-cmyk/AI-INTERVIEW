/**
 * Test tính level kỹ năng — `src/lib/levels.ts` (tasks.md 4.6 · AC-3).
 *
 * 🔑 **AC-3 cốt lõi**: level của kỹ năng KHÔNG BAO GIỜ tăng do:
 *   - tick checkbox hoàn thành slot (`PlanItem.done`),
 *   - AI tự chấm / AI gợi ý.
 *
 * Level CHỈ tăng khi có đủ `Evidence` với `rating >= 3`.
 * Vì vậy hàm `levelForEvidenceCount` **chỉ nhận số bằng chứng đã lọc** —
 * người gọi (`recomputeSkillLevel`) phải lọc `rating: { gte: 3 }` trước.
 * Test dưới đây khẳng định đúng tính chất đó: 100 bằng chứng "yếu/tạm"
 * vẫn để level ở 0.
 */

import { describe, expect, it } from "vitest";
import {
  evidenceToNextLevel,
  LEVEL_THRESHOLDS,
  levelForEvidenceCount,
  MAX_LEVEL,
  progressToNextLevel,
} from "@/lib/levels";

describe("LEVEL_THRESHOLDS & MAX_LEVEL", () => {
  it("ngưỡng đúng theo đặc tả: 0 · 2 · 5 · 9 · 14 · 20", () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 2, 5, 9, 14, 20]);
  });

  it("MAX_LEVEL = 5 (thang 0–5 của SPEC §2.2 FR-SK-06)", () => {
    expect(MAX_LEVEL).toBe(5);
  });
});

describe("levelForEvidenceCount", () => {
  it("0 bằng chứng → level 0", () => {
    expect(levelForEvidenceCount(0)).toBe(0);
  });

  it("2 bằng chứng → level 1", () => {
    expect(levelForEvidenceCount(2)).toBe(1);
  });

  it("5 bằng chứng → level 2", () => {
    expect(levelForEvidenceCount(5)).toBe(2);
  });

  it("9 bằng chứng → level 3", () => {
    expect(levelForEvidenceCount(9)).toBe(3);
  });

  it("14 bằng chứng → level 4", () => {
    expect(levelForEvidenceCount(14)).toBe(4);
  });

  it("20 bằng chứng → level 5", () => {
    expect(levelForEvidenceCount(20)).toBe(5);
  });

  it("100 bằng chứng → vẫn MAX_LEVEL (5), không vượt thang", () => {
    expect(levelForEvidenceCount(100)).toBe(MAX_LEVEL);
  });

  it("chỉ lên level khi ĐẠT ngưỡng, thiếu 1 bằng chứng là chưa lên", () => {
    expect(levelForEvidenceCount(1)).toBe(0);
    expect(levelForEvidenceCount(4)).toBe(1);
    expect(levelForEvidenceCount(8)).toBe(2);
    expect(levelForEvidenceCount(13)).toBe(3);
    expect(levelForEvidenceCount(19)).toBe(4);
  });

  it("không bao giờ trả về level âm hoặc > MAX_LEVEL", () => {
    for (const count of [0, 1, 7, 19, 20, 1000]) {
      const level = levelForEvidenceCount(count);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });
});

describe("AC-3 — level chỉ tăng qua Evidence chất lượng", () => {
  /**
   * Mô phỏng đúng cách `recomputeSkillLevel` đếm:
   * lọc `rating >= 3` rồi mới gọi `levelForEvidenceCount`.
   */
  const levelFromEvidences = (ratings: number[]): number =>
    levelForEvidenceCount(ratings.filter((r) => r >= 3).length);

  it("3 bằng chứng yếu/tạm (rating 1–2) KHÔNG tăng level", () => {
    expect(levelFromEvidences([1, 2, 1])).toBe(0);
  });

  it("100 bằng chứng rating < 3 vẫn để level ở 0", () => {
    const ratings = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 1 : 2));
    expect(levelFromEvidences(ratings)).toBe(0);
  });

  it("2 evidence rating 3 + 1 evidence rating 4 → level 1 (đúng AC-3)", () => {
    expect(levelFromEvidences([3, 3, 4])).toBe(1);
  });

  it("bằng chứng rating 3 và 4 đều được tính như nhau", () => {
    expect(levelFromEvidences([3, 3, 4])).toBe(levelFromEvidences([4, 4, 4]));
  });

  it("chỉ 1 evidence rating 3 thì chưa đủ lên level 1", () => {
    expect(levelFromEvidences([3])).toBe(0);
  });

  it("tích luỹ đủ 5 bằng chứng chất lượng → level 2", () => {
    expect(levelFromEvidences([3, 3, 3, 4, 3])).toBe(2);
  });

  it("tick checkbox không sinh bằng chứng nên không đổi level", () => {
    // `PlanItem.done = true` không tạo `Evidence` → số bằng chứng vẫn 0.
    const before = levelFromEvidences([]);
    // Không có thao tác nào trên DB trong test unit này — chỉ khẳng định bất biến.
    expect(before).toBe(0);
  });
});

describe("evidenceToNextLevel", () => {
  it("level 0 cần 2 bằng chứng để lên level 1", () => {
    expect(evidenceToNextLevel(0, 0)).toBe(2);
    expect(evidenceToNextLevel(0, 1)).toBe(1);
    expect(evidenceToNextLevel(0, 2)).toBe(0);
  });

  it("level 1 cần thêm 3 bằng chứng (2 → 5)", () => {
    expect(evidenceToNextLevel(1, 2)).toBe(3);
    expect(evidenceToNextLevel(1, 4)).toBe(1);
    expect(evidenceToNextLevel(1, 5)).toBe(0);
  });

  it("level 4 cần thêm 6 bằng chứng (14 → 20)", () => {
    expect(evidenceToNextLevel(4, 14)).toBe(6);
    expect(evidenceToNextLevel(4, 19)).toBe(1);
  });

  it("Ở MAX_LEVEL thì không cần thêm gì", () => {
    expect(evidenceToNextLevel(MAX_LEVEL, 20)).toBe(0);
    expect(evidenceToNextLevel(MAX_LEVEL, 0)).toBe(0);
  });

  it("không trả về số âm khi đã vượt ngưỡng", () => {
    for (let level = 0; level <= MAX_LEVEL; level += 1) {
      expect(evidenceToNextLevel(level, 100)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("progressToNextLevel", () => {
  it("luôn nằm trong 0..100", () => {
    for (let level = 0; level <= MAX_LEVEL; level += 1) {
      for (const count of [0, 1, 2, 5, 9, 14, 20, 100]) {
        const pct = progressToNextLevel(level, count);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("0% khi chưa có bằng chứng nào", () => {
    expect(progressToNextLevel(0, 0)).toBe(0);
  });

  it("50% khi đi được nửa chặng đường (1/2 bằng chứng)", () => {
    expect(progressToNextLevel(0, 1)).toBe(50);
  });

  it("100% khi đã đạt ngưỡng của level kế tiếp", () => {
    expect(progressToNextLevel(0, 2)).toBe(100);
  });

  it("100% ở MAX_LEVEL", () => {
    expect(progressToNextLevel(MAX_LEVEL, 20)).toBe(100);
    expect(progressToNextLevel(MAX_LEVEL, 0)).toBe(100);
  });

  it("không vượt 100% khi bằng chứng dư", () => {
    expect(progressToNextLevel(0, 50)).toBe(100);
  });
});
