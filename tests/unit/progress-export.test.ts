/**
 * Test payload JSON xuất ra — `src/lib/progress-export.ts` (task 16.7).
 *
 * Done 16.7: JSON gồm kpi, domains, self_comparison. Test bảo vệ đúng 3 khối
 * bắt buộc + việc bộ lọc domain được áp vào payload.
 *
 * Xem tasks.md 16.7 · requirements.md AC 12.9.
 */

import { describe, expect, it } from "vitest";
import { buildExportPayload } from "@/lib/progress-export";
import { buildProgressReport, type ProgressRawData } from "@/lib/progress-data";

const NOW = new Date(2026, 9, 30, 10, 0, 0);

function makeData(): ProgressRawData {
  return {
    skills: [
      { id: "s1", name: "A", domain: "professional", level: 2, createdAt: new Date(2026, 0, 1) },
      { id: "s2", name: "B", domain: "language", level: 1, createdAt: new Date(2026, 0, 1) },
    ],
    evidences: [
      {
        id: "e1",
        skillId: "s1",
        rating: 4,
        createdAt: new Date(2026, 9, 28),
        activityDomain: "professional",
        activityType: "write",
      },
    ],
    activities: [
      {
        id: "a1",
        domain: "professional",
        type: "write",
        minutes: 90,
        title: "Bài viết có sản phẩm",
        aiScore: 4,
        createdAt: new Date(2026, 9, 28),
        hasEvidence: true,
      },
    ],
    reviews: [{ rating: 3, at: new Date(2026, 9, 28) }],
  };
}

describe("buildExportPayload (16.7)", () => {
  it("có đủ 3 khối bắt buộc: kpi, domains, self_comparison", () => {
    const report = buildProgressReport(makeData(), NOW);
    const payload = buildExportPayload(report, "ABC123", report.domains, NOW);

    expect(payload).toHaveProperty("kpi");
    expect(payload).toHaveProperty("domains");
    expect(payload).toHaveProperty("self_comparison");
    expect(payload.spec).toContain("S14");
    expect(payload.generated_at).toBe(NOW.toISOString());
    expect(payload.digest).toBe("ABC123");
    expect(payload.period.from).toBe(report.period.from);
    expect(payload.period.to).toBe(report.period.to);
  });

  it("kpi giữ nguyên giá trị thật, không bịa số 0", () => {
    const report = buildProgressReport(makeData(), NOW);
    const payload = buildExportPayload(report, null, report.domains, NOW);

    expect(payload.kpi.average_skill_level).toBe(1.5);
    expect(payload.kpi.evidence_this_month).toBe(1);
    expect(payload.kpi.fsrs_retention_rate).toBe(1);
    expect(payload.kpi.communication_reflex_score).toBe(4);
    expect(payload.kpi.practice_hours_with_evidence).toBe(1.5);
    expect(payload.kpi.skill_count).toBe(2);
  });

  it("domains giữ tỷ trọng + nguồn đo, quy đổi phút sang giờ", () => {
    const report = buildProgressReport(makeData(), NOW);
    const payload = buildExportPayload(report, null, report.domains, NOW);

    expect(payload.domains).toHaveLength(4);
    const professional = payload.domains.find((d) => d.domain === "professional");
    expect(professional?.practice_hours).toBe(1.5);
    expect(professional?.practice_share).toBe(1);
    expect(professional?.source).toBeTruthy();
  });

  it("bộ lọc domain được áp vào payload (task 16.6)", () => {
    const report = buildProgressReport(makeData(), NOW);
    const filtered = report.domains.filter((d) => d.domain === "language");
    const payload = buildExportPayload(report, null, filtered, NOW);

    expect(payload.domains).toHaveLength(1);
    expect(payload.domains[0]?.domain).toBe("language");
  });

  it("self_comparison tính delta = hiện tại − trước, null khi thiếu dữ liệu", () => {
    const report = buildProgressReport(makeData(), NOW);
    const payload = buildExportPayload(report, null, report.domains, NOW);

    expect(payload.self_comparison.period).toBe(report.comparison.periodLabel);
    const evidence = payload.self_comparison.metrics.find((m) => m.key === "evidence_count");
    expect(evidence?.current).toBe(1);
    expect(evidence?.previous).toBe(0);
    expect(evidence?.delta).toBe(1);

    // Dòng chưa có dữ liệu ở kỳ trước → delta null, không bịa 0.
    const fsrs = payload.self_comparison.metrics.find((m) => m.key === "fsrs_retention");
    expect(fsrs?.previous).toBeNull();
    expect(fsrs?.delta).toBeNull();
  });
});
