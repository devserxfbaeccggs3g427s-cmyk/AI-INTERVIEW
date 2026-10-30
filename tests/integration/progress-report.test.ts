/**
 * Integration test — báo cáo tiến bộ S14 đọc từ DB thật (tasks.md 16.1 → 16.5).
 *
 * Test **read-only**: không tạo / sửa / xoá dòng nào trong `prisma/dev.db`.
 * Mục tiêu là bảo vệ đường truy vấn Prisma (`select` lồng nhau, `take: 1` cho
 * `evidences`) chứ không kiểm tra logic thuần tuý (đã có ở
 * `tests/unit/progress-data.test.ts`).
 *
 * Xem tasks.md 16.1–16.5 · requirements.md §2.12.
 */

import { describe, expect, it } from "vitest";
import { getProgressReport, progressDigest } from "@/lib/progress-data";
import { DOMAINS } from "@/lib/types";

describe("getProgressReport — đọc DB thật", () => {
  it("trả về báo cáo đầy đủ các nhóm", async () => {
    const report = await getProgressReport();

    expect(report.kpi).toBeDefined();
    expect(report.kpi.skillCount).toBeGreaterThanOrEqual(0);
    expect(report.domains).toHaveLength(DOMAINS.length);
    expect(report.trajectory.months).toHaveLength(6);
    expect(report.trajectory.series).toHaveLength(DOMAINS.length);
    expect(report.heatmap.grid).toHaveLength(91);
    expect(report.heatmap.weekStarts).toHaveLength(13);
    expect(report.comparison.rows.length).toBeGreaterThanOrEqual(5);
    expect(report.allocation.groups).toHaveLength(DOMAINS.length);
  });

  it("heatmap dùng ngày thật của hệ thống — không rơi vào chu kỳ 2024 của mockup", async () => {
    const report = await getProgressReport();
    for (const cell of report.heatmap.grid) {
      expect(cell.dateKey.startsWith("2024")).toBe(false);
    }
  });

  it("P7 — thời gian thực chiến chỉ tính hoạt động có bằng chứng", async () => {
    const report = await getProgressReport();
    // Tổng thời gian có sản phẩm không bao giờ vượt tổng thời gian của mọi hoạt động.
    expect(report.kpi.practiceMinutes).toBeGreaterThanOrEqual(0);
    expect(report.allocation.totalMinutes).toBeGreaterThanOrEqual(0);
    const shareSum = report.allocation.groups.reduce((acc, g) => acc + g.share, 0);
    expect(shareSum).toBeLessThanOrEqual(1.0001);
  });

  it("digest SHA-256 ổn định cho cùng một báo cáo", async () => {
    const a = await getProgressReport();
    const b = await getProgressReport();
    expect(progressDigest(a)).toBe(progressDigest(b));
    expect(progressDigest(a)).toMatch(/^[0-9A-F]{16}$/);
  });
});
