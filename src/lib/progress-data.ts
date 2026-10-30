import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { addDays, dateKey, startOfDay, startOfWeek } from "@/lib/dates";
import { levelForEvidenceCount } from "@/lib/levels";
import type {
  CompareRow,
  DomainProgress,
  HeatmapCounts,
  HeatmapData,
  PracticeGroup,
  ProgressKpi,
  ProgressReport,
  SelfCompareData,
  TimeAllocationData,
  TrajectoryData,
} from "@/lib/progress-types";
import {
  ACTIVITY_TYPE_LABELS,
  DOMAIN_LABELS,
  DOMAINS,
  type ActivityType,
  type Domain,
} from "@/lib/types";

/**
 * Dữ liệu báo cáo tiến bộ cho S14 (`/progress`) — tasks.md 16.1 → 16.5.
 *
 * Nguyên tắc bắt buộc:
 *   - **P3 — Tiến độ = bằng chứng.** Mọi chỉ số đều dựng từ `Evidence`,
 *     không dựa vào "đã tick" hay cảm nhận.
 *   - **P7 — Không vanity metric.** KHÔNG có KPI "tổng giờ học" trần trụi:
 *     thời gian chỉ được tính khi hoạt động **có sản phẩm** (`Evidence`).
 *   - Level lịch sử được **tái dựng** từ `Evidence` (rating >= 3) chứ không
 *     dùng `Skill.level` hiện tại cho mọi tháng — nếu không, quỹ đạo 6 tháng
 *     sẽ là 4 đường phẳng vô nghĩa.
 *
 * Mọi ngày đều chuẩn hoá theo **giờ local** (dùng `dateKey`/`startOfDay`),
 * không dùng `toISOString()` để lấy ngày (xem `src/lib/dates.ts`).
 *
 * Kiểu DTO nằm ở `src/lib/progress-types.ts` để Client Component import được
 * mà không kéo Prisma vào bundle.
 *
 * Xem tasks.md 16.1–16.5 · requirements.md §2.12 (AC 12.1–12.11).
 */

/** Số ngày của 1 chu kỳ so sánh (hiện tại vs 30 ngày trước). */
export const COMPARE_WINDOW_DAYS = 30;
/** Số tháng hiển thị trên quỹ đạo. */
export const TRAJECTORY_MONTHS = 6;
/** Số ngày của lưới heatmap. */
export const HEATMAP_DAYS = 90;
/** Số cột tuần của lưới heatmap (13 tuần × 7 ngày = 91 ô). */
export const HEATMAP_WEEKS = 13;
/** Loại hoạt động tính vào "điểm phản xạ giao tiếp". */
const REFLEX_TYPES: ActivityType[] = ["write", "speak", "mock_interview"];

/** `Skill.domain` / `Activity.domain` lưu chuỗi — ép về `Domain` an toàn. */
function toDomain(value: string): Domain {
  return (DOMAINS as readonly string[]).includes(value) ? (value as Domain) : "personal";
}

/** Làm tròn 2 chữ số — giữ được mức khác biệt nhỏ của level trung bình. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Trung bình hoặc `null` khi không có mẫu nào. */
function average(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return round2(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/**
 * SHA-256 ngắn của báo cáo (AC 12.8) — hash **ổn định** của payload báo cáo,
 * cắt 16 ký tự hex để hiển thị gọn. Cùng dữ liệu → cùng digest.
 */
export function progressDigest(report: ProgressReport): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex").slice(0, 16).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Truy vấn
// ─────────────────────────────────────────────────────────────────────────────

export type SkillRow = { id: string; name: string; domain: Domain; level: number; createdAt: Date };
export type EvidenceRow = {
  id: string;
  skillId: string;
  rating: number;
  createdAt: Date;
  activityDomain: Domain;
  activityType: ActivityType;
};
export type ActivityRow = {
  id: string;
  domain: Domain;
  type: ActivityType;
  minutes: number;
  title: string;
  aiScore: number | null;
  createdAt: Date;
  hasEvidence: boolean;
};
export type ReviewRow = { rating: number; at: Date };

/** Toàn bộ dữ liệu thô cần để dựng báo cáo. */
export type ProgressRawData = {
  skills: SkillRow[];
  evidences: EvidenceRow[];
  activities: ActivityRow[];
  reviews: ReviewRow[];
};

/**
 * Dựng báo cáo tiến bộ từ DB.
 *
 * Gom 4 bảng bằng `Promise.all` — mỗi bảng 1 truy vấn, không N+1.
 */
export async function getProgressReport(now: Date = new Date()): Promise<ProgressReport> {
  const [skills, evidences, activities, reviews] = await Promise.all([
    prisma.skill.findMany({
      select: { id: true, name: true, domain: true, level: true, createdAt: true },
    }),
    prisma.evidence.findMany({
      select: {
        id: true,
        skillId: true,
        rating: true,
        createdAt: true,
        activity: { select: { domain: true, type: true } },
      },
    }),
    prisma.activity.findMany({
      select: {
        id: true,
        domain: true,
        type: true,
        minutes: true,
        title: true,
        aiScore: true,
        createdAt: true,
        // Chỉ cần biết "có bằng chứng hay không" → lấy tối đa 1 bản ghi.
        evidences: { select: { id: true }, take: 1 },
      },
    }),
    prisma.review.findMany({ select: { rating: true, at: true } }),
  ]);

  const raw: ProgressRawData = {
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      domain: toDomain(s.domain),
      level: s.level,
      createdAt: s.createdAt,
    })),
    evidences: evidences.map((e) => ({
      id: e.id,
      skillId: e.skillId,
      rating: e.rating,
      createdAt: e.createdAt,
      activityDomain: toDomain(e.activity.domain),
      activityType: (e.activity.type as ActivityType) ?? "custom",
    })),
    activities: activities.map((a) => ({
      id: a.id,
      domain: toDomain(a.domain),
      type: (a.type as ActivityType) ?? "custom",
      minutes: a.minutes ?? 0,
      title: a.title,
      aiScore: a.aiScore,
      createdAt: a.createdAt,
      hasEvidence: a.evidences.length > 0,
    })),
    reviews: reviews.map((r) => ({ rating: r.rating, at: r.at })),
  };

  return buildProgressReport(raw, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tính toán thuần tuý (pure) — dễ test, không phụ thuộc DB
// ─────────────────────────────────────────────────────────────────────────────

/** Khoảng 30 ngày hiện tại + 30 ngày trước đó. */
function windows(now: Date): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
} {
  const currentStart = startOfDay(addDays(now, -(COMPARE_WINDOW_DAYS - 1)));
  const currentEnd = now;
  const previousStart = startOfDay(addDays(now, -(COMPARE_WINDOW_DAYS * 2 - 1)));
  const previousEnd = startOfDay(addDays(now, -COMPARE_WINDOW_DAYS));
  return { currentStart, currentEnd, previousStart, previousEnd };
}

/**
 * Tái dựng level của 1 skill tại mốc thời gian — theo đúng luật FR-SK-03:
 * level N cần `LEVEL_THRESHOLDS[N]` bằng chứng rating >= 3 tính đến mốc đó.
 */
function levelAt(
  skill: SkillRow,
  cutoff: Date,
  evidenceBySkill: Map<string, EvidenceRow[]>,
): number {
  const list = evidenceBySkill.get(skill.id) ?? [];
  const count = list.filter((e) => e.rating >= 3 && e.createdAt < cutoff).length;
  return levelForEvidenceCount(count);
}

/** Level trung bình của 1 danh sách skill tại mốc thời gian. */
function averageLevelAt(
  skills: SkillRow[],
  cutoff: Date,
  evidenceBySkill: Map<string, EvidenceRow[]>,
): number | null {
  const levels = skills
    .filter((s) => s.createdAt < cutoff)
    .map((s) => levelAt(s, cutoff, evidenceBySkill));
  return average(levels);
}

/** 6 tháng gần nhất (bao gồm tháng hiện tại). */
function lastMonths(
  now: Date,
  count: number,
): Array<{ key: string; label: string; shortLabel: string; start: Date; nextStart: Date }> {
  const out: Array<{
    key: string;
    label: string;
    shortLabel: string;
    start: Date;
    nextStart: Date;
  }> = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: `Tháng ${start.getMonth() + 1}/${start.getFullYear()}`,
      shortLabel: `T${start.getMonth() + 1}`,
      start,
      nextStart,
    });
  }
  return out;
}

/** Khoảng thời gian của 1 tháng (đầu tháng → đầu tháng sau). */
function monthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/** Khoảng thời gian của tháng trước. */
function previousMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end };
}

/** Dựng toàn bộ báo cáo từ dữ liệu thô đã nạp. */
export function buildProgressReport(
  data: ProgressRawData,
  now: Date = new Date(),
): ProgressReport {
  const { skills, evidences, activities, reviews } = data;
  const w = windows(now);

  // Index theo skill cho việc tái dựng level lịch sử.
  const evidenceBySkill = new Map<string, EvidenceRow[]>();
  for (const e of evidences) {
    const list = evidenceBySkill.get(e.skillId);
    if (list) list.push(e);
    else evidenceBySkill.set(e.skillId, [e]);
  }

  // ── KPI (task 16.1) ────────────────────────────────────────────────────────
  const averageLevel = average(skills.map((s) => s.level));
  const averageLevel30d = averageLevelAt(skills, w.currentStart, evidenceBySkill);
  const averageLevelDelta =
    averageLevel !== null && averageLevel30d !== null
      ? round2(averageLevel - averageLevel30d)
      : null;

  const month = monthRange(now);
  const prevMonth = previousMonthRange(now);
  const evidenceThisMonth = evidences.filter(
    (e) => e.createdAt >= month.start && e.createdAt < month.end,
  ).length;
  const evidencePrevMonth = evidences.filter(
    (e) => e.createdAt >= prevMonth.start && e.createdAt < prevMonth.end,
  ).length;

  // Tỷ lệ giữ FSRS = review rating >= 3 / tổng review trong khoảng.
  const recentReviews = reviews.filter((r) => r.at >= w.currentStart && r.at <= w.currentEnd);
  const useAllReviews = recentReviews.length === 0;
  const scopedReviews = useAllReviews ? reviews : recentReviews;
  const keptReviews = scopedReviews.filter((r) => r.rating >= 3).length;
  const fsrsRetention =
    scopedReviews.length === 0 ? null : round2(keptReviews / scopedReviews.length);

  // Điểm phản xạ giao tiếp = TB `Activity.aiScore` của write/speak/mock_interview.
  const reflexActivities = activities.filter((a) => REFLEX_TYPES.includes(a.type));
  const recentReflex = reflexActivities.filter(
    (a) => a.createdAt >= w.currentStart && a.createdAt <= w.currentEnd && a.aiScore !== null,
  );
  const useAllReflex = recentReflex.length === 0;
  const scopedReflex = useAllReflex
    ? reflexActivities.filter((a) => a.aiScore !== null)
    : recentReflex;
  const communicationScore = average(scopedReflex.map((a) => a.aiScore ?? 0));

  // Thời gian thực chiến CÓ SẢN PHẨM (P7): activity có ít nhất 1 Evidence.
  const practicedActivities = activities.filter((a) => a.hasEvidence);
  const practiceMinutes = practicedActivities
    .filter((a) => a.createdAt >= w.currentStart && a.createdAt <= w.currentEnd)
    .reduce((acc, a) => acc + a.minutes, 0);

  const kpi: ProgressKpi = {
    averageLevel,
    averageLevelDelta,
    skillCount: skills.length,
    evidenceThisMonth,
    evidencePrevMonth,
    monthLabel: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
    fsrsRetention,
    fsrsReviewCount: scopedReviews.length,
    fsrsWindow: useAllReviews ? "toàn bộ" : `${COMPARE_WINDOW_DAYS} ngày`,
    communicationScore,
    communicationSampleCount: scopedReflex.length,
    communicationWindow: useAllReflex ? "toàn bộ" : `${COMPARE_WINDOW_DAYS} ngày`,
    practiceMinutes,
    practiceHours: round2(practiceMinutes / 60),
  };

  // ── Theo domain (AC 12.2) ─────────────────────────────────────────────────
  const windowActivitiesForDomain = practicedActivities.filter(
    (a) => a.createdAt >= w.currentStart && a.createdAt <= w.currentEnd,
  );
  const totalPracticeMinutes = windowActivitiesForDomain.reduce(
    (acc, a) => acc + a.minutes,
    0,
  );

  const domains: DomainProgress[] = DOMAINS.map((domain) => {
    const domainSkills = skills.filter((s) => s.domain === domain);
    const domainActivities = windowActivitiesForDomain.filter((a) => a.domain === domain);
    const minutes = domainActivities.reduce((acc, a) => acc + a.minutes, 0);
    return {
      domain,
      label: DOMAIN_LABELS[domain],
      level: average(domainSkills.map((s) => s.level)),
      skillCount: domainSkills.length,
      evidenceCount: evidences.filter((e) => e.activityDomain === domain).length,
      practiceMinutes: minutes,
      activityCount: domainActivities.length,
      share: totalPracticeMinutes === 0 ? 0 : round2(minutes / totalPracticeMinutes),
      source: "Skill.level (chuẩn hoá theo cây 3 tầng)",
    };
  });

  // ── Quỹ đạo 6 tháng (task 16.2) ──────────────────────────────────────────
  const months = lastMonths(now, TRAJECTORY_MONTHS);
  const trajectory: TrajectoryData = {
    months: months.map((m) => ({ key: m.key, label: m.label, shortLabel: m.shortLabel })),
    series: DOMAINS.map((domain) => {
      const domainSkills = skills.filter((s) => s.domain === domain);
      return {
        domain,
        label: DOMAIN_LABELS[domain],
        levels: months.map((m) => averageLevelAt(domainSkills, m.nextStart, evidenceBySkill)),
      };
    }),
  };

  // ── Heatmap 90 ngày (task 16.3) ───────────────────────────────────────────
  const gridStart = addDays(startOfWeek(now), -7 * (HEATMAP_WEEKS - 1));
  const grid: HeatmapData["grid"] = [];
  const weekStarts: string[] = [];
  for (let col = 0; col < HEATMAP_WEEKS; col += 1) {
    const weekStart = addDays(gridStart, col * 7);
    weekStarts.push(dateKey(weekStart));
    for (let row = 0; row < 7; row += 1) {
      const day = addDays(weekStart, row);
      grid.push({ dateKey: dateKey(day), isFuture: day > startOfDay(now) });
    }
  }

  const heatmapCounts = {} as HeatmapCounts;
  for (const domain of DOMAINS) heatmapCounts[domain] = {};
  for (const e of evidences) {
    const key = dateKey(e.createdAt);
    const bucket = heatmapCounts[e.activityDomain];
    if (bucket) bucket[key] = (bucket[key] ?? 0) + 1;
  }

  // Chuỗi liên tục + ngày năng suất nhất (AC 12.11) — tính trên toàn hệ thống.
  const allCounts = new Map<string, number>();
  for (const domain of DOMAINS) {
    for (const [key, count] of Object.entries(heatmapCounts[domain])) {
      allCounts.set(key, (allCounts.get(key) ?? 0) + count);
    }
  }
  let longestStreak = 0;
  for (let i = 0; i < HEATMAP_DAYS; i += 1) {
    const day = addDays(startOfDay(now), -i);
    if ((allCounts.get(dateKey(day)) ?? 0) > 0) longestStreak += 1;
    else break;
  }
  const weekdayTotals = new Array<number>(7).fill(0);
  const weekdayDays = new Array<number>(7).fill(0);
  for (let i = 0; i < HEATMAP_DAYS; i += 1) {
    const day = addDays(startOfDay(now), -i);
    const idx = (day.getDay() + 6) % 7; // Thứ Hai = 0
    weekdayTotals[idx] = (weekdayTotals[idx] ?? 0) + (allCounts.get(dateKey(day)) ?? 0);
    weekdayDays[idx] = (weekdayDays[idx] ?? 0) + 1;
  }
  const weekdayNames = [
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
    "Chủ Nhật",
  ];
  let bestWeekday: HeatmapData["bestWeekday"] = null;
  for (let idx = 0; idx < 7; idx += 1) {
    const days = weekdayDays[idx] ?? 0;
    if (days === 0) continue;
    const avgPerDay = round2((weekdayTotals[idx] ?? 0) / days);
    if (!bestWeekday || avgPerDay > bestWeekday.average) {
      bestWeekday = { label: weekdayNames[idx] ?? "", average: avgPerDay };
    }
  }

  const heatmap: HeatmapData = {
    grid,
    weekStarts,
    weekdays: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
    longestStreak,
    bestWeekday,
    totalEvidence: evidences.length,
  };

  // ── Tự đối sánh 30 ngày (task 16.4) ───────────────────────────────────────
  const inCurrent = (d: Date) => d >= w.currentStart && d <= w.currentEnd;
  const inPrevious = (d: Date) => d >= w.previousStart && d <= w.previousEnd;

  const currentReflex = activities.filter(
    (a) => REFLEX_TYPES.includes(a.type) && a.aiScore !== null && inCurrent(a.createdAt),
  );
  const previousReflex = activities.filter(
    (a) => REFLEX_TYPES.includes(a.type) && a.aiScore !== null && inPrevious(a.createdAt),
  );

  const currentReviews = reviews.filter((r) => inCurrent(r.at));
  const previousReviews = reviews.filter((r) => inPrevious(r.at));
  const retentionOf = (list: ReviewRow[]) =>
    list.length === 0 ? null : round2(list.filter((r) => r.rating >= 3).length / list.length);

  const currentMinutes = practicedActivities
    .filter((a) => inCurrent(a.createdAt))
    .reduce((acc, a) => acc + a.minutes, 0);
  const previousMinutes = practicedActivities
    .filter((a) => inPrevious(a.createdAt))
    .reduce((acc, a) => acc + a.minutes, 0);

  const comparisonRows: CompareRow[] = [
    {
      key: "average_level",
      label: "Level kỹ năng bình quân",
      description: "Tái dựng từ Evidence rating >= 3 tại mốc thời gian (chuẩn FR-SK-03).",
      previous: averageLevelAt(skills, w.currentStart, evidenceBySkill),
      current: averageLevel,
      unit: "/ 5",
      format: "level",
      higherIsBetter: true,
    },
    {
      key: "evidence_count",
      label: "Bằng chứng tạo ra",
      description: "Số Evidence mới trong kỳ — đơn vị đo tiến bộ duy nhất (P3).",
      previous: evidences.filter((e) => inPrevious(e.createdAt)).length,
      current: evidences.filter((e) => inCurrent(e.createdAt)).length,
      unit: "bằng chứng",
      format: "count",
      higherIsBetter: true,
    },
    {
      key: "fsrs_retention",
      label: "Tỷ lệ giữ FSRS",
      description: "Review rating >= 3 chia tổng review trong kỳ.",
      previous: retentionOf(previousReviews),
      current: retentionOf(currentReviews),
      unit: "%",
      format: "percent",
      higherIsBetter: true,
    },
    {
      key: "communication_score",
      label: "Điểm phản xạ giao tiếp",
      description: "TB điểm AI của hoạt động viết / nói / mock interview.",
      previous: average(previousReflex.map((a) => a.aiScore ?? 0)),
      current: average(currentReflex.map((a) => a.aiScore ?? 0)),
      unit: "/ 5",
      format: "score",
      higherIsBetter: true,
    },
    {
      key: "practice_hours",
      label: "Thời gian thực chiến có sản phẩm",
      description: "Chỉ tính hoạt động có ít nhất 1 Evidence (P7).",
      previous: round2(previousMinutes / 60),
      current: round2(currentMinutes / 60),
      unit: "giờ",
      format: "hours",
      higherIsBetter: true,
    },
  ];

  const comparison: SelfCompareData = {
    periodLabel: `${COMPARE_WINDOW_DAYS} ngày`,
    rows: comparisonRows,
  };

  // ── Phân bổ thời gian thực chiến (task 16.5) ───────────────────────────────
  const windowActivities = practicedActivities.filter((a) => inCurrent(a.createdAt));
  const totalMinutes = windowActivities.reduce((acc, a) => acc + a.minutes, 0);
  const groups: PracticeGroup[] = DOMAINS.map((domain) => {
    const items = windowActivities.filter((a) => a.domain === domain);
    const minutes = items.reduce((acc, a) => acc + a.minutes, 0);
    const products = [...items]
      .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title))
      .slice(0, 3)
      .map((a) => ({
        id: a.id,
        title: a.title,
        minutes: a.minutes,
        typeLabel: ACTIVITY_TYPE_LABELS[a.type] ?? "Khác",
      }));
    return {
      domain,
      label: DOMAIN_LABELS[domain],
      minutes,
      hours: round2(minutes / 60),
      share: totalMinutes === 0 ? 0 : round2(minutes / totalMinutes),
      activityCount: items.length,
      evidenceCount: evidences.filter(
        (e) => e.activityDomain === domain && inCurrent(e.createdAt),
      ).length,
      products,
    };
  });

  const allocation: TimeAllocationData = {
    groups,
    totalMinutes,
    totalHours: round2(totalMinutes / 60),
    totalActivities: windowActivities.length,
    totalEvidence: evidences.filter((e) => inCurrent(e.createdAt)).length,
    periodLabel: `${COMPARE_WINDOW_DAYS} ngày gần nhất`,
  };

  return {
    kpi,
    domains,
    trajectory,
    heatmap,
    heatmapCounts,
    comparison,
    allocation,
    period: {
      from: dateKey(w.currentStart),
      to: dateKey(w.currentEnd),
      label: `${COMPARE_WINDOW_DAYS} ngày gần nhất`,
    },
  };
}
