/**
 * Test báo cáo tiến bộ S14 — `src/lib/progress-data.ts` (tasks.md 16.1 → 16.5).
 *
 * Bảo vệ 4 điều then chốt:
 *   - **P3 — tiến độ = bằng chứng**: level chỉ lên khi có `Evidence` rating ≥ 3.
 *   - **P7 — không vanity metric**: thời gian chỉ được tính cho hoạt động **có
 *     sản phẩm**; không có KPI "tổng giờ học" trần trụi.
 *   - **Heatmap chỉ tô ô có sản phẩm** và dùng **ngày thật** (không rơi vào
 *     chu kỳ 2024 của mockup).
 *   - **Tự đối sánh 30 ngày** tách đúng 2 kỳ (hiện tại vs trước).
 *
 * Test dùng dữ liệu thô giả lập → gọi `buildProgressReport` (hàm thuần tuý,
 * không chạm DB).
 *
 * Xem tasks.md 16.1–16.5 · requirements.md §2.12.
 */

import { describe, expect, it } from "vitest";
import { buildProgressReport, type ProgressRawData } from "@/lib/progress-data";
import { addDays, startOfDay } from "@/lib/dates";

/** Mốc thời gian cố định để test không phụ thuộc ngày hôm nay. */
const NOW = new Date(2026, 9, 30, 10, 0, 0); // 30/10/2026 10:00 giờ local

/** Ngày trước `days` ngày so với NOW. */
function daysAgo(days: number): Date {
  return startOfDay(addDays(NOW, -days));
}

function makeData(overrides: Partial<ProgressRawData> = {}): ProgressRawData {
  return {
    skills: [],
    evidences: [],
    activities: [],
    reviews: [],
    ...overrides,
  };
}

describe("buildProgressReport — KPI (16.1)", () => {
  it("level TB lấy từ `Skill.level`, không tự bịa", () => {
    const report = buildProgressReport(
      makeData({
        skills: [
          { id: "s1", name: "A", domain: "professional", level: 3, createdAt: daysAgo(200) },
          { id: "s2", name: "B", domain: "language", level: 1, createdAt: daysAgo(200) },
        ],
      }),
      NOW,
    );
    expect(report.kpi.averageLevel).toBe(2);
    expect(report.kpi.skillCount).toBe(2);
  });

  it("bằng chứng tháng = số `Evidence` tạo trong tháng hiện tại", () => {
    const report = buildProgressReport(
      makeData({
        evidences: [
          {
            id: "e1",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(2),
            activityDomain: "professional",
            activityType: "study",
          },
          {
            id: "e2",
            skillId: "s1",
            rating: 4,
            createdAt: daysAgo(40), // tháng trước
            activityDomain: "professional",
            activityType: "study",
          },
        ],
      }),
      NOW,
    );
    expect(report.kpi.evidenceThisMonth).toBe(1);
    expect(report.kpi.evidencePrevMonth).toBe(1);
  });

  it("tỷ lệ giữ FSRS = review rating ≥ 3 / tổng review trong kỳ", () => {
    const report = buildProgressReport(
      makeData({
        reviews: [
          { rating: 3, at: daysAgo(3) },
          { rating: 4, at: daysAgo(5) },
          { rating: 1, at: daysAgo(6) },
          { rating: 2, at: daysAgo(7) },
        ],
      }),
      NOW,
    );
    expect(report.kpi.fsrsRetention).toBe(0.5);
    expect(report.kpi.fsrsReviewCount).toBe(4);
  });

  it("điểm phản xạ giao tiếp chỉ lấy write / speak / mock_interview", () => {
    const report = buildProgressReport(
      makeData({
        activities: [
          { id: "a1", domain: "communication", type: "write", minutes: 10, title: "w", aiScore: 4, createdAt: daysAgo(2), hasEvidence: true },
          { id: "a2", domain: "communication", type: "speak", minutes: 10, title: "s", aiScore: 2, createdAt: daysAgo(3), hasEvidence: true },
          { id: "a3", domain: "professional", type: "study", minutes: 60, title: "study", aiScore: 5, createdAt: daysAgo(2), hasEvidence: true },
        ],
      }),
      NOW,
    );
    // Chỉ 2 hoạt động giao tiếp được tính: (4 + 2) / 2 = 3.
    expect(report.kpi.communicationScore).toBe(3);
    expect(report.kpi.communicationSampleCount).toBe(2);
  });

  it("P7 — thời gian chỉ tính hoạt động CÓ bằng chứng, không tính giờ học trần trụi", () => {
    const report = buildProgressReport(
      makeData({
        activities: [
          { id: "a1", domain: "professional", type: "study", minutes: 120, title: "có SP", aiScore: null, createdAt: daysAgo(2), hasEvidence: true },
          { id: "a2", domain: "professional", type: "study", minutes: 300, title: "không SP", aiScore: null, createdAt: daysAgo(3), hasEvidence: false },
        ],
      }),
      NOW,
    );
    expect(report.kpi.practiceMinutes).toBe(120);
    expect(report.kpi.practiceHours).toBe(2);
  });

  it("không có dữ liệu → `null` thay vì số 0 bịa ra", () => {
    const report = buildProgressReport(makeData(), NOW);
    expect(report.kpi.averageLevel).toBeNull();
    expect(report.kpi.fsrsRetention).toBeNull();
    expect(report.kpi.communicationScore).toBeNull();
    expect(report.kpi.evidenceThisMonth).toBe(0);
  });
});

describe("buildProgressReport — quỹ đạo 6 tháng (16.2)", () => {
  it("có đúng 6 tháng và 4 đường domain", () => {
    const report = buildProgressReport(makeData(), NOW);
    expect(report.trajectory.months).toHaveLength(6);
    expect(report.trajectory.series).toHaveLength(4);
    expect(report.trajectory.series.map((s) => s.domain)).toEqual([
      "professional",
      "communication",
      "language",
      "personal",
    ]);
  });

  it("level lịch sử tái dựng từ Evidence rating ≥ 3, không phẳng theo `Skill.level`", () => {
    const report = buildProgressReport(
      makeData({
        skills: [
          { id: "s1", name: "A", domain: "professional", level: 1, createdAt: daysAgo(200) },
        ],
        evidences: [
          // 2 bằng chứng rating 3 tạo 40 ngày trước → level 1 từ tháng trước.
          {
            id: "e1",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(40),
            activityDomain: "professional",
            activityType: "study",
          },
          {
            id: "e2",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(41),
            activityDomain: "professional",
            activityType: "study",
          },
        ],
      }),
      NOW,
    );
    const professional = report.trajectory.series.find((s) => s.domain === "professional");
    expect(professional).toBeDefined();
    const levels = professional?.levels ?? [];
    // Tháng cuối cùng = level hiện tại (1).
    expect(levels[levels.length - 1]).toBe(1);
    // Tháng đầu (trước khi có bằng chứng) = 0 → quỹ đạo KHÔNG phẳng.
    expect(levels[0]).toBe(0);
  });
});

describe("buildProgressReport — heatmap 90 ngày (16.3)", () => {
  it("lưới 13 tuần × 7 ngày = 91 ô, không dùng chu kỳ 2024 của mockup", () => {
    const report = buildProgressReport(makeData(), NOW);
    expect(report.heatmap.grid).toHaveLength(91);
    expect(report.heatmap.weekStarts).toHaveLength(13);
    const firstKey = report.heatmap.grid[0]?.dateKey ?? "";
    expect(firstKey.startsWith("2024")).toBe(false);
    expect(firstKey.startsWith("2026")).toBe(true);
  });

  it("chỉ tô ô có bằng chứng — ô trống có count = 0", () => {
    const report = buildProgressReport(
      makeData({
        evidences: [
          {
            id: "e1",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(1),
            activityDomain: "language",
            activityType: "study",
          },
        ],
      }),
      NOW,
    );
    const counts = report.heatmapCounts.language ?? {};
    const yesterday = daysAgo(1);
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    expect(counts[key]).toBe(1);
    const empty = Object.entries(counts).filter(([, v]) => v === 0);
    expect(empty).toHaveLength(0);
  });

  it("chuỗi liên tục đếm ngược từ hôm nay", () => {
    const report = buildProgressReport(
      makeData({
        evidences: [0, 1, 2].map((i) => ({
          id: `e${i}`,
          skillId: "s1",
          rating: 3,
          createdAt: daysAgo(i),
          activityDomain: "personal" as const,
          activityType: "study" as const,
        })),
      }),
      NOW,
    );
    expect(report.heatmap.longestStreak).toBe(3);
  });
});

describe("buildProgressReport — tự đối sánh 30 ngày (16.4)", () => {
  it("tách đúng 2 kỳ: hiện tại (30 ngày) vs 30 ngày trước", () => {
    const report = buildProgressReport(
      makeData({
        evidences: [
          {
            id: "e-now",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(5),
            activityDomain: "professional",
            activityType: "study",
          },
          {
            id: "e-old",
            skillId: "s1",
            rating: 3,
            createdAt: daysAgo(45),
            activityDomain: "professional",
            activityType: "study",
          },
        ],
      }),
      NOW,
    );
    const row = report.comparison.rows.find((r) => r.key === "evidence_count");
    expect(row?.current).toBe(1);
    expect(row?.previous).toBe(1);

    const delta = report.comparison.rows.find((r) => r.key === "evidence_count");
    expect(delta?.description).toBeTruthy();
  });

  it("mọi dòng so sánh đều có đơn vị + mô tả nguồn đo", () => {
    const report = buildProgressReport(makeData(), NOW);
    expect(report.comparison.rows.length).toBeGreaterThanOrEqual(5);
    for (const row of report.comparison.rows) {
      expect(row.unit).toBeTruthy();
      expect(row.description).toBeTruthy();
    }
  });
});

describe("buildProgressReport — phân bổ thời gian (16.5)", () => {
  it("4 nhóm theo domain, chỉ tính hoạt động có bằng chứng", () => {
    const report = buildProgressReport(
      makeData({
        activities: [
          { id: "a1", domain: "professional", type: "study", minutes: 60, title: "SP", aiScore: null, createdAt: daysAgo(2), hasEvidence: true },
          { id: "a2", domain: "language", type: "srs", minutes: 30, title: "no-SP", aiScore: null, createdAt: daysAgo(2), hasEvidence: false },
        ],
      }),
      NOW,
    );
    expect(report.allocation.groups).toHaveLength(4);
    expect(report.allocation.totalMinutes).toBe(60);
    expect(report.allocation.totalHours).toBe(1);
    const professional = report.allocation.groups.find((g) => g.domain === "professional");
    expect(professional?.minutes).toBe(60);
    expect(professional?.share).toBe(1);
  });

  it("tỷ trọng của 4 nhóm cộng lại = 1", () => {
    const report = buildProgressReport(
      makeData({
        activities: [
          { id: "a1", domain: "professional", type: "study", minutes: 60, title: "a", aiScore: null, createdAt: daysAgo(2), hasEvidence: true },
          { id: "a2", domain: "language", type: "srs", minutes: 30, title: "b", aiScore: null, createdAt: daysAgo(3), hasEvidence: true },
        ],
      }),
      NOW,
    );
    const sum = report.allocation.groups.reduce((acc, g) => acc + g.share, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});
