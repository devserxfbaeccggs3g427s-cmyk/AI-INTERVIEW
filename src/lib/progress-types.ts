/**
 * Kiểu dữ liệu (DTO) của báo cáo tiến bộ S14.
 *
 * Tách riêng khỏi `src/lib/progress-data.ts` (module `server-only`) để các
 * Client Component — `TrajectoryChart`, `EvidenceHeatmap`, `SelfCompareTable`,
 * `TimeAllocationChart` — có thể import **kiểu** mà không kéo Prisma vào
 * bundle.
 *
 * Xem tasks.md 16.1–16.7.
 */

import type { Domain } from "@/lib/types";

/** 4 KPI của báo cáo (task 16.1). */
export type ProgressKpi = {
  /** Level trung bình của toàn bộ skill — nguồn `Skill.level`. */
  averageLevel: number | null;
  /** Chênh lệch so với 30 ngày trước (tái dựng từ `Evidence`). */
  averageLevelDelta: number | null;
  /** Số skill đang theo dõi. */
  skillCount: number;
  /** Số bằng chứng tạo trong tháng hiện tại. */
  evidenceThisMonth: number;
  /** Số bằng chứng của tháng trước (để so sánh). */
  evidencePrevMonth: number;
  /** Nhãn tháng hiện tại, ví dụ "Tháng 10/2026". */
  monthLabel: string;
  /** Tỷ lệ giữ FSRS 0..1 — review rating >= 3 / tổng review. */
  fsrsRetention: number | null;
  /** Số review dùng để tính tỷ lệ. */
  fsrsReviewCount: number;
  /** Khoảng dùng để tính tỷ lệ giữ FSRS. */
  fsrsWindow: string;
  /** Điểm phản xạ giao tiếp TB (thang 0–5) — `Activity.aiScore`. */
  communicationScore: number | null;
  /** Số hoạt động có điểm AI dùng để tính. */
  communicationSampleCount: number;
  /** Khoảng dùng để tính điểm phản xạ. */
  communicationWindow: string;
  /** Thời gian thực chiến **có sản phẩm** (phút) trong 30 ngày — P7. */
  practiceMinutes: number;
  /** Thời gian thực chiến có sản phẩm (giờ) trong 30 ngày. */
  practiceHours: number;
};

/** Tiến độ theo từng domain (AC 12.2). */
export type DomainProgress = {
  domain: Domain;
  label: string;
  /** Level trung bình của các skill thuộc domain — nguồn `Skill.level`. */
  level: number | null;
  skillCount: number;
  /** Số bằng chứng của domain — nguồn `Evidence` + `Activity.domain`. */
  evidenceCount: number;
  /** Phút thực chiến có sản phẩm trong 30 ngày. */
  practiceMinutes: number;
  /** Số hoạt động có sản phẩm trong 30 ngày. */
  activityCount: number;
  /** Tỷ trọng thời gian thực chiến 0..1. */
  share: number;
  /** Mô tả nguồn đo — AC 12.2 yêu cầu nói rõ đo từ đâu. */
  source: string;
};

/** Một điểm tháng trên quỹ đạo. */
export type TrajectoryMonth = {
  /** Khoá tháng `YYYY-MM`. */
  key: string;
  /** Nhãn trục X, ví dụ "Tháng 10/2026". */
  label: string;
  /** Nhãn rút gọn, ví dụ "T10". */
  shortLabel: string;
};

/** Một đường domain trên quỹ đạo. */
export type TrajectorySeries = {
  domain: Domain;
  label: string;
  /** Level trung bình của domain tại từng tháng (cùng thứ tự `months`). */
  levels: Array<number | null>;
};

/** Dữ liệu quỹ đạo 6 tháng (task 16.2). */
export type TrajectoryData = {
  months: TrajectoryMonth[];
  series: TrajectorySeries[];
};

/** Lưới heatmap 90 ngày (task 16.3). */
export type HeatmapData = {
  /** 13 tuần × 7 ngày, phẳng theo **cột** (mỗi cột = 1 tuần T2→CN). */
  grid: Array<{ dateKey: string; isFuture: boolean }>;
  /** dateKey đầu mỗi cột (thứ Hai của tuần). */
  weekStarts: string[];
  /** Nhãn thứ trong tuần — T2 … CN. */
  weekdays: string[];
  /** Chuỗi ngày có bằng chứng dài nhất. */
  longestStreak: number;
  /** Ngày trong tuần có bình quân bằng chứng cao nhất. */
  bestWeekday: { label: string; average: number } | null;
  /** Tổng bằng chứng toàn hệ thống. */
  totalEvidence: number;
};

/** Số đếm bằng chứng theo ngày, tách theo domain — để lọc client-side. */
export type HeatmapCounts = Record<Domain, Record<string, number>>;

/** Một dòng so sánh "hiện tại vs 30 ngày trước" (task 16.4). */
export type CompareRow = {
  key: string;
  label: string;
  /** Mô tả nguồn đo. */
  description: string;
  /** Giá trị 30 ngày trước — hiển thị **gạch ngang**. */
  previous: number | null;
  /** Giá tại hiện tại. */
  current: number | null;
  /** Đơn vị hiển thị, ví dụ "/ 5", "%", "giờ". */
  unit: string;
  /** Định dạng số. */
  format: "level" | "count" | "percent" | "hours" | "score";
  /** `true` nếu tăng là tốt (dùng cho màu delta). */
  higherIsBetter: boolean;
};

/** Bảng tự đối sánh. */
export type SelfCompareData = {
  rows: CompareRow[];
  /** Nhãn kỳ so sánh, ví dụ "30 ngày". */
  periodLabel: string;
};

/** Một sản phẩm thực tế đã tạo (để mô tả dưới mỗi nhóm thời gian). */
export type PracticeProduct = {
  id: string;
  title: string;
  minutes: number;
  typeLabel: string;
};

/** Một nhóm thực chiến (task 16.5). */
export type PracticeGroup = {
  domain: Domain;
  label: string;
  minutes: number;
  hours: number;
  /** Tỷ trọng % của tổng thực chiến. */
  share: number;
  activityCount: number;
  evidenceCount: number;
  /** Vài sản phẩm nổi bật nhất của nhóm. */
  products: PracticeProduct[];
};

/** Phân bổ thời gian thực chiến. */
export type TimeAllocationData = {
  groups: PracticeGroup[];
  totalMinutes: number;
  totalHours: number;
  totalActivities: number;
  totalEvidence: number;
  /** Khoảng thời gian đã dùng để tính. */
  periodLabel: string;
};

/** Toàn bộ báo cáo. */
export type ProgressReport = {
  kpi: ProgressKpi;
  domains: DomainProgress[];
  trajectory: TrajectoryData;
  heatmap: HeatmapData;
  heatmapCounts: HeatmapCounts;
  comparison: SelfCompareData;
  allocation: TimeAllocationData;
  /** Khoảng báo cáo (dùng cho nhãn + file export). */
  period: { from: string; to: string; label: string };
};

/** Nội dung file JSON xuất ra (task 16.7). */
export type ProgressExportPayload = {
  spec: string;
  generated_at: string;
  period: { from: string; to: string; label: string };
  /** SHA-256 ngắn của báo cáo (AC 12.8). */
  digest: string | null;
  kpi: {
    average_skill_level: number | null;
    average_skill_level_delta_30d: number | null;
    skill_count: number;
    evidence_this_month: number;
    evidence_prev_month: number;
    fsrs_retention_rate: number | null;
    fsrs_review_count: number;
    communication_reflex_score: number | null;
    communication_sample_count: number;
    practice_hours_with_evidence: number;
  };
  domains: Array<{
    domain: string;
    label: string;
    level: number | null;
    skill_count: number;
    evidence_count: number;
    practice_hours: number;
    practice_share: number;
    source: string;
  }>;
  self_comparison: {
    period: string;
    metrics: Array<{
      key: string;
      label: string;
      unit: string;
      previous: number | null;
      current: number | null;
      delta: number | null;
    }>;
  };
};
