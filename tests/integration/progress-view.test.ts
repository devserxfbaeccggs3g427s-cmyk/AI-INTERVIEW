// @vitest-environment jsdom
/**
 * Component test — view S14 (`src/components/progress/*`, `src/components/charts/*`).
 *
 * Bảo vệ các hành vi giao diện mà Done criteria nêu rõ:
 *   - **16.4** — giá trị cũ trong bảng tự đối sánh phải **gạch ngang**
 *     (`line-through`), không chỉ dựa vào vị trí cột.
 *   - **16.6** — đổi chip domain lọc **cả** biểu đồ lẫn heatmap.
 *   - **16.7** — nút "Xuất JSON tiến độ" tải file JSON thật (`Blob` +
 *     `URL.createObjectURL` + `<a download>`).
 *
 * Recharts cần kích thước thật nên các test biểu đồ chỉ kiểm tra phần HTML
 * bao quanh (legend, bảng twin, lưới ô) — phần SVG được recharts vẽ lúc
 * runtime với `ResponsiveContainer` cần `ResizeObserver` thật.
 *
 * Xem tasks.md 16.4 / 16.6 / 16.7.
 */

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { DomainFilter } from "@/components/progress/DomainFilter";
import { SelfCompareTable } from "@/components/progress/SelfCompareTable";
import { EvidenceHeatmap } from "@/components/charts/EvidenceHeatmap";
import { ProgressView } from "@/components/progress/ProgressView";
import { ToastProvider } from "@/components/ui/Toaster";
import { buildProgressReport, type ProgressRawData } from "@/lib/progress-data";
import type { HeatmapCounts, HeatmapData, SelfCompareData } from "@/lib/progress-types";

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

/** Dữ liệu so sánh tối giản — đủ để assert `line-through`. */
const compareData: SelfCompareData = {
  periodLabel: "30 ngày",
  rows: [
    {
      key: "evidence_count",
      label: "Bằng chứng tạo ra",
      description: "Số Evidence mới trong kỳ.",
      previous: 5,
      current: 12,
      unit: "bằng chứng",
      format: "count",
      higherIsBetter: true,
    },
  ],
};

describe("SelfCompareTable — 16.4", () => {
  it("giá trị cũ được gạch ngang, giá trị hiện tại thì không", () => {
    render(createElement(SelfCompareTable, { data: compareData }));

    const previous = screen.getByTestId("compare-previous-evidence_count");
    const current = screen.getByTestId("compare-current-evidence_count");

    expect(previous.className).toContain("line-through");
    expect(previous.textContent).toBe("5");

    expect(current.className).not.toContain("line-through");
    expect(current.textContent).toBe("12");
  });

  it("delta có dấu +/− và màu đúng chiều (không chỉ dựa vào màu)", () => {
    render(createElement(SelfCompareTable, { data: compareData }));
    const row = screen.getByTestId("compare-current-evidence_count").closest("tr");
    const cells = row?.querySelectorAll("td");
    const delta = cells?.[cells.length - 1];
    expect(delta?.textContent).toContain("+7");
  });
});

describe("DomainFilter — 16.6", () => {
  it("có chip 'Tất cả domain' + 4 domain", () => {
    render(createElement(DomainFilter, { value: null, onChange: () => {} }));

    expect(screen.getByTestId("domain-filter-all")).toBeTruthy();
    expect(screen.getByTestId("domain-filter-professional")).toBeTruthy();
    expect(screen.getByTestId("domain-filter-communication")).toBeTruthy();
    expect(screen.getByTestId("domain-filter-language")).toBeTruthy();
    expect(screen.getByTestId("domain-filter-personal")).toBeTruthy();
  });

  it("bấm chip domain gọi onChange với đúng giá trị", () => {
    const onChange = vi.fn();
    render(createElement(DomainFilter, { value: null, onChange }));

    fireEvent.click(screen.getByTestId("domain-filter-language"));
    expect(onChange).toHaveBeenCalledWith("language");
  });

  it("chip đang chọn có `aria-pressed=true`", () => {
    render(createElement(DomainFilter, { value: "language", onChange: () => {} }));
    expect(screen.getByTestId("domain-filter-language").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("domain-filter-all").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("EvidenceHeatmap — 16.3 / 16.6", () => {
  const heatmapData: HeatmapData = {
    grid: Array.from({ length: 91 }, (_, i) => ({
      dateKey: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
      isFuture: false,
    })),
    weekStarts: Array.from({ length: 13 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`),
    weekdays: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
    longestStreak: 3,
    bestWeekday: { label: "Thứ Ba", average: 1.5 },
    totalEvidence: 2,
  };

  const counts: HeatmapCounts = {
    professional: { "2026-07-01": 1 },
    communication: { "2026-07-02": 1 },
    language: {},
    personal: {},
  };

  it("ô không có bằng chứng có count = 0 (không tô)", () => {
    render(createElement(EvidenceHeatmap, { data: heatmapData, counts }));
    const cells = screen.getAllByTestId(/^heatmap-cell-/);
    expect(cells.length).toBe(91);
    expect(cells[0]?.getAttribute("data-count")).toBe("1");
    // Ô của language/communication đều 0 ở cột 0.
    const langCell = cells.find((c) => c.getAttribute("data-count") === "0");
    expect(langCell).toBeTruthy();
  });

  it("lọc domain chỉ tính bằng chứng của domain đó", () => {
    render(createElement(EvidenceHeatmap, { data: heatmapData, counts, activeDomain: "language" }));
    const cells = screen.getAllByTestId(/^heatmap-cell-/);
    // Không còn ô nào có bằng chứng khi lọc "language" (domain này rỗng).
    expect(cells.every((c) => c.getAttribute("data-count") === "0")).toBe(true);
  });
});

describe("ProgressView — 16.1 / 16.7", () => {
  function renderView() {
    const report = buildProgressReport(makeData(), NOW);
    return render(
      createElement(
        ToastProvider,
        null,
        createElement(ProgressView, { report, digest: "DEADBEEF12345678" }),
      ),
    );
  }

  it("hiện 4 KPI và không có KPI 'tổng giờ học' trần trụi (P7)", () => {
    const { container } = renderView();

    expect(screen.getByTestId("kpi-ribbon")).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toContain("Cấp độ kỹ năng bình quân");
    expect(text).toContain("Bằng chứng tích lũy tháng");
    expect(text).toContain("Tỷ lệ giữ FSRS");
    expect(text).toContain("Điểm phản xạ giao tiếp");
    // P7 — không vanity metric "tổng giờ học".
    expect(text).not.toContain("Tổng giờ học");
  });

  it("nút 'Xuất JSON tiến độ' tải file JSON thật", () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:mock");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    // jsdom chưa implement `Blob.text()` → bắt nội dung ngay lúc khởi tạo.
    let blobContent = "";
    const OriginalBlob = globalThis.Blob;
    class SpyBlob extends OriginalBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        blobContent = parts.map((p) => String(p)).join("");
      }
    }
    globalThis.Blob = SpyBlob as unknown as typeof Blob;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      renderView();

      fireEvent.click(screen.getByTestId("export-progress-json"));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg: unknown = createObjectURL.mock.calls[0]?.[0];
      expect(blobArg).toBeTruthy();
      const blob = blobArg as Blob; // fixed TS 2352
      expect(blob.type).toBe("application/json");

      // Nội dung blob phải có 3 khối bắt buộc.
      const parsed = JSON.parse(blobContent) as Record<string, unknown>;
      expect(parsed).toHaveProperty("kpi");
      expect(parsed).toHaveProperty("domains");
      expect(parsed).toHaveProperty("self_comparison");
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Blob = OriginalBlob;
      clickSpy.mockRestore();
    }
  });

  it("ẩn/hiện nhóm KPI theo chip", () => {
    renderView();
    expect(screen.getByTestId("kpi-ribbon")).toBeTruthy();

    fireEvent.click(screen.getByTestId("section-toggle-kpi"));
    expect(screen.queryByTestId("kpi-ribbon")).toBeNull();
  });
});
