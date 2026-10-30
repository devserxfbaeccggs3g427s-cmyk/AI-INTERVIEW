/**
 * S12 — Card "Dữ liệu đã gửi lên" (task 8.6 · FR-PS-07 · AC 10.9).
 *
 * ⚠️ NFR-08 / P6 STRICT_LOCAL — cam kết cứng:
 *   Dữ liệu sinh trắc (mood/energy/focus/sleep) **KHÔNG BAO GIỜ** rời máy.
 *   Ở Phase 0, S12 **không** gọi AI cho dữ liệu sinh trắc — task
 *   `biometric_correlate` đi qua engine cục bộ theo design.md §6.1.
 *   Vì vậy `DailyState` luôn hiển thị badge "KHÔNG gửi — STRICT_LOCAL".
 *
 * Các loại dữ liệu *có thể* đi lên API được liệt kê kèm trạng thái **thật**,
 * đọc từ bảng `AiCall` (feature + provider + createdAt) — không hardcode.
 *
 * Xem tasks.md 8.6 · design.md §4.12 / §6.1 · requirements.md FR-PS-07, NFR-08.
 */

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, StatusDot } from "@/components/ui/Chip";
import { prisma } from "@/lib/db";
import { relativeTime } from "@/lib/dates";

/** Một loại dữ liệu + các `AiCall.feature` tương ứng. */
type DataCategory = {
  id: string;
  label: string;
  description: string;
  /** Các feature của AI Router mang dữ liệu này (design.md §6.1). */
  features: string[];
  /**
   * `true` = cam kết P6 STRICT_LOCAL — dữ liệu này **không bao giờ** rời máy.
   * Mọi task của nhóm này đều chạy bằng engine cục bộ.
   */
  strictLocal: boolean;
  /** Loại dữ liệu có thể đi lên cloud hay không (theo bảng routing §6.1). */
  canLeaveDevice: boolean;
};

const CATEGORIES: DataCategory[] = [
  {
    id: "daily-state",
    label: "Chỉ số sinh trắc (mood · energy · focus · sleep)",
    description: "Ghi trong DailyState — chỉ nằm trong SQLite trên máy.",
    features: ["biometric_correlate"],
    strictLocal: true,
    canLeaveDevice: false,
  },
  {
    id: "quick-log",
    label: "Nội dung quick-log",
    description: "Nội dung ghi nhanh — task autofill chạy bằng model cục bộ.",
    features: ["autofill"],
    strictLocal: false,
    canLeaveDevice: false,
  },
  {
    id: "journal",
    label: "Nội dung nhật ký (khi bấm “Gửi AI phản hồi”)",
    description: "Chỉ được gửi khi người dùng bấm nút gửi — không tự động.",
    features: ["journal_feedback", "classify"],
    strictLocal: false,
    canLeaveDevice: true,
  },
  {
    id: "interview",
    label: "Câu trả lời mock interview",
    description: "Câu trả lời + bài làm được gửi tới Anthropic để chấm điểm.",
    features: ["mock_interview", "mock_interview_turn", "mock_interview_report"],
    strictLocal: false,
    canLeaveDevice: true,
  },
  {
    id: "plan",
    label: "Nội dung kế hoạch ngày",
    description: "Tên slot + bối cảnh người dùng dùng để sinh kế hoạch.",
    features: ["daily_plan"],
    strictLocal: false,
    canLeaveDevice: true,
  },
  {
    id: "speak",
    label: "Bài luyện giao tiếp / roleplay",
    description: "Nội dung bài tập và câu trả lời khi luyện nói.",
    features: ["roleplay", "grading"],
    strictLocal: false,
    canLeaveDevice: true,
  },
  {
    id: "language",
    label: "Nội dung luyện ngoại ngữ & bài kiểm tra",
    description: "Từ vựng, đề bài và câu trả lời của bài kiểm tra.",
    features: [
      "language_cards",
      "language_test_grade",
      "language_correct",
      "language_level",
      "test_from_content",
    ],
    strictLocal: false,
    canLeaveDevice: true,
  },
];

/** Thống kê theo feature — gom từ bảng `AiCall` để phản ánh thực tế. */
type FeatureStat = {
  calls: number;
  /** Lần gọi gần nhất. */
  lastAt: Date | null;
  /** Có lần gọi nào lên Anthropic (cloud) không. */
  hasCloud: boolean;
};

async function loadFeatureStats(features: string[]): Promise<Map<string, FeatureStat>> {
  const stats = new Map<string, FeatureStat>();
  if (features.length === 0) return stats;

  const rows = await prisma.aiCall.groupBy({
    by: ["feature", "provider"],
    where: { feature: { in: features } },
    _count: { _all: true },
  });

  const latest = await prisma.aiCall.findMany({
    where: { feature: { in: features } },
    select: { feature: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  for (const row of rows) {
    const current = stats.get(row.feature) ?? {
      calls: 0,
      lastAt: null,
      hasCloud: false,
    };
    current.calls += row._count._all;
    if (row.provider !== "local") current.hasCloud = true;
    stats.set(row.feature, current);
  }

  for (const row of latest) {
    const current = stats.get(row.feature);
    if (!current) continue;
    if (current.lastAt === null || row.createdAt > current.lastAt) {
      current.lastAt = row.createdAt;
    }
  }

  return stats;
}

/**
 * Card "Dữ liệu đã gửi lên".
 *
 * Server Component — đọc thẳng `AiCall` ở server rồi render ra UI tĩnh.
 */
export async function DataSentCard() {
  const allFeatures = CATEGORIES.flatMap((category) => category.features);
  const stats = await loadFeatureStats(allFeatures);

  return (
    <Card>
      <CardHeader
        title="Dữ liệu đã gửi lên"
        subtitle="FR-PS-07 · minh bạch dữ liệu nào đã rời máy"
        icon="cloud_off"
        action={<Badge tone="outline">P6 STRICT_LOCAL</Badge>}
      />

      <ul className="space-y-space-md">
        {CATEGORIES.map((category) => {
          const categoryStats = category.features
            .map((feature) => stats.get(feature))
            .filter((stat): stat is FeatureStat => stat !== undefined);

          const calls = categoryStats.reduce((sum, stat) => sum + stat.calls, 0);
          const hasCloud = categoryStats.some((stat) => stat.hasCloud);
          const lastDates = categoryStats
            .map((stat) => stat.lastAt)
            .filter((date): date is Date => date !== null)
            .sort((a, b) => b.getTime() - a.getTime());
          const lastAt = lastDates[0] ?? null;

          // Ưu tiên cam kết STRICT_LOCAL — dữ liệu sinh trắc KHÔNG BAO GIỜ gửi.
          const strict = category.strictLocal;
          const onlyLocal = !strict && !hasCloud;

          return (
            <li
              key={category.id}
              className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-space-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-space-xs">
                    {/*
                      `StatusDot` chỉ hỗ trợ 4 tone: primary | tertiary | error | outline
                      → dùng `tertiary` cho trạng thái "đã đi lên cloud" (tương đương
                      màu secondary của `Badge` ở nhánh bên dưới).
                    */}
                    <StatusDot tone={strict ? "primary" : hasCloud ? "tertiary" : "outline"} />
                    <span className="font-body-md font-semibold text-on-surface">
                      {category.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">
                    {category.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {strict ? (
                    <Badge tone="primary">KHÔNG gửi — STRICT_LOCAL</Badge>
                  ) : hasCloud ? (
                    <Badge tone="secondary">Đã gửi lên Anthropic</Badge>
                  ) : calls > 0 ? (
                    <Badge tone="primary">Chỉ xử lý cục bộ</Badge>
                  ) : (
                    <Badge tone="outline">Chưa có lần gửi nào</Badge>
                  )}
                  {calls > 0 ? (
                    <span className="font-code-md text-[11px] text-on-surface-variant">
                      {calls} lượt · {lastAt ? relativeTime(lastAt) : "—"}
                    </span>
                  ) : null}
                </div>
              </div>

              {!strict && !category.canLeaveDevice ? (
                <p className="mt-space-xs font-label-sm text-outline">
                  Task cục bộ — nội dung không đi qua cloud.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Cam kết P6 — AC 10.9 */}
      <div className="mt-gutter rounded-lg border border-primary/30 bg-primary-container/10 p-space-md">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            verified_user
          </span>
          <span className="font-label-md text-primary">Cam kết bảo mật dữ liệu sinh trắc P6</span>
        </div>
        <p className="mt-space-xs text-body-sm text-on-surface-variant">
          Toàn bộ dữ liệu sinh trắc chỉ nằm trong SQLite trên máy bạn. Không tải lên bất kỳ máy chủ
          đám mây nào; phân tích tương quan do engine cục bộ xử lý.
        </p>
      </div>
    </Card>
  );
}
