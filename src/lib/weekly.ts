/**
 * Tổng hợp tuần cho S13 — Báo cáo tuần (tasks.md 15.1 / 15.2 / 15.6).
 *
 * Ba nhiệm vụ:
 *   1. **Tổng hợp tuần** — số hành động, phân bổ domain, top 3 kỹ năng,
 *      mood/sleep trung bình → so sánh với tuần trước.
 *   2. **Chốt chạy 1 lần / tuần** — cờ `WeeklyReviewRun.weekKey` (task 15.2).
 *   3. **Giảm tải kế hoạch** — khi trượt ≥2 ngày liên tiếp → ít slot hơn
 *      + ghi chú lý do (FR-WR-05).
 *
 * Xem tasks.md 15.1 / 15.2 / 15.6 · design.md §4.13 · requirements.md FR-WR-05.
 */

import "server-only";

import { prisma } from "@/lib/db";
import { addDays, currentWeek, dateKey, startOfDay, startOfWeek } from "@/lib/dates";
import { DOMAINS, type Domain } from "@/lib/types";

/**
 * Khoá tuần ISO 8601 dạng `2026-W44` — dùng làm `WeeklyReviewRun.weekKey`.
 *
 * Thuật toán chuẩn ISO 8601: tuần bắt đầu thứ Hai, **tuần 1 là tuần có ngày
 * 4 tháng 1** → tuần 1 thường có ngày 29/12 của năm trước.
 *
 * Dùng `Date.UTC` + `getUTC*` để không lệch theo múi giờ local.
 */
export function weekKey(input: Date | string | number = new Date()): string {
  const src = input instanceof Date ? input : new Date(input);
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  // Thứ Hai = 1 … Chủ Nhật = 7.
  const dayNum = d.getUTCDay() || 7;
  // Lùi về thứ Tư của tuần đó — ngày luôn nằm trong đúng tuần ISO.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Tổng hợp 1 tuần — dữ liệu thô để S13 render. */
export type WeeklySummary = {
  /** Khoá tuần, dạng `2026-W44`. */
  weekKey: string;
  /** Thứ Hai 00:00 của tuần. */
  start: Date;
  /** Chủ Nhật 23:59:59.999 của tuần. */
  end: Date;

  // ── Hành động ───────────────────────────────────────────────────────────
  /** Tổng số `Activity` trong tuần. */
  activityCount: number;
  /** Số phút học trong tuần. */
  totalMinutes: number;
  /** Số slot kế hoạch đã hoàn thành / tổng số slot. */
  planDone: number;
  planTotal: number;
  /** Tỷ lệ hoàn thành 0..1 (0 khi chưa có slot nào). */
  completionRate: number;

  // ── Phân bổ domain ─────────────────────────────────────────────────────
  /** Số hành động theo từng domain (luôn đủ 4 domain, kể cả 0). */
  domainCounts: Record<Domain, number>;
  /** Phút theo từng domain. */
  domainMinutes: Record<Domain, number>;

  // ── Kỹ năng ────────────────────────────────────────────────────────────
  /** Top 3 kỹ năng hoạt động nhiều nhất trong tuần. */
  topSkills: Array<{ id: string; name: string; count: number; minutes: number }>;

  // ── Trạng thái ──────────────────────────────────────────────────────────
  /** Mood trung bình 1..5 (null khi không có dữ liệu). */
  avgMood: number | null;
  /** Sleep trung bình (giờ). */
  avgSleep: number | null;
  /** Energy trung bình 1..5. */
  avgEnergy: number | null;
  /** Số ngày có dữ liệu `DailyState` trong tuần. */
  stateDays: number;

  // ── SRS ────────────────────────────────────────────────────────────────
  /** Số lượt ôn SRS trong tuần (Activity type = "srs"). */
  srsReviews: number;
  /** Số thẻ đến hạn tính đến cuối tuần. */
  dueCards: number;

  // ── Giảm tải ───────────────────────────────────────────────────────────
  /** Số ngày trượt liên tiếp tính từ hôm nay (ngược lại). */
  missedDays: number;
  /** Có cần giảm tải không (trượt ≥2 ngày) — FR-WR-05. */
  needsRelief: boolean;
};

/** Tổng hợp tuần trước — chỉ các trường so sánh được. */
export type WeeklyComparison = {
  activityCount: number;
  totalMinutes: number;
  planDone: number;
  planTotal: number;
  completionRate: number;
  avgMood: number | null;
  avgSleep: number | null;
  evidenceCount: number;
};

/** Khoảng thời gian 1 tuần (thứ Hai → Chủ Nhật 23:59). */
function weekRange(input: Date | string | number): { start: Date; end: Date } {
  return currentWeek(input);
}

/** Khoảng tuần trước (lùi 7 ngày từ tuần hiện tại). */
export function previousWeekRange(input: Date | string | number = new Date()): {
  start: Date;
  end: Date;
} {
  const { start } = weekRange(input);
  const prevStart = addDays(start, -7);
  const prevEnd = new Date(prevStart.getTime());
  prevEnd.setDate(prevEnd.getDate() + 6);
  prevEnd.setHours(23, 59, 59, 999);
  return { start: prevStart, end: prevEnd };
}

/** Khởi tạo map domain đủ 4 domain — tránh `undefined` khi map trong JSX. */
function emptyDomainRecord<T>(initial: T): Record<Domain, T> {
  const out = {} as Record<Domain, T>;
  for (const d of DOMAINS) out[d] = initial;
  return out;
}

/**
 * Tổng hợp tuần chứa `input` — task 15.1.
 *
 * @param input ngày bất kỳ trong tuần cần xem (mặc định hôm nay)
 */
export async function summarizeWeek(input: Date | string | number = new Date()): Promise<WeeklySummary> {
  const { start, end } = weekRange(input);

  const [activities, planItems, states, srsCount, dueCards, skillGroups] = await Promise.all([
    prisma.activity.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        domain: true,
        type: true,
        minutes: true,
        createdAt: true,
        skillId: true,
        skill: { select: { id: true, name: true } },
        evidences: { select: { id: true } },
      },
    }),
    prisma.planItem.findMany({
      where: { date: { gte: start, lte: end } },
      select: { done: true, date: true },
    }),
    prisma.dailyState.findMany({
      where: { date: { gte: start, lte: end } },
      select: { mood: true, energy: true, sleep: true },
    }),
    prisma.activity.count({
      where: { createdAt: { gte: start, lte: end }, type: "srs" },
    }),
    prisma.card.count({ where: { due: { lte: end } } }),
    prisma.activity.groupBy({
      by: ["skillId"],
      where: { createdAt: { gte: start, lte: end }, skillId: { not: null } },
      _count: { _all: true },
      _sum: { minutes: true },
    }),
  ]);

  // ── Phân bổ domain ─────────────────────────────────────────────────────
  const domainCounts = emptyDomainRecord<number>(0);
  const domainMinutes = emptyDomainRecord<number>(0);
  for (const a of activities) {
    const d = (DOMAINS.includes(a.domain as Domain) ? a.domain : "personal") as Domain;
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
    domainMinutes[d] = (domainMinutes[d] ?? 0) + (a.minutes ?? 0);
  }

  // ── Top 3 kỹ năng ───────────────────────────────────────────────────────
  const skillIds = skillGroups.map((g) => g.skillId).filter((id): id is string => Boolean(id));
  const skillMeta = skillIds.length
    ? await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true, name: true },
      })
    : [];
  const skillNameById = new Map(skillMeta.map((s) => [s.id, s.name]));
  const topSkills = skillGroups
    .map((g) => ({
      id: g.skillId as string,
      name: skillNameById.get(g.skillId as string) ?? "Không rõ",
      count: g._count._all,
      minutes: g._sum.minutes ?? 0,
    }))
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 3);

  // ── Trạng thái ──────────────────────────────────────────────────────────
  const moods = states.map((s) => s.mood).filter((m): m is number => m !== null);
  const sleeps = states.map((s) => s.sleep).filter((s): s is number => s !== null);
  const energies = states.map((s) => s.energy).filter((e): e is number => e !== null);
  const avg = (xs: number[]): number | null =>
    xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

  // ── Kế hoạch ───────────────────────────────────────────────────────────
  const planTotal = planItems.length;
  const planDone = planItems.filter((p) => p.done).length;

  // ── Giảm tải (FR-WR-05) ─────────────────────────────────────────────────
  const missedDays = await countMissedDays(startOfDay(input));

  return {
    weekKey: weekKey(input),
    start,
    end,
    activityCount: activities.length,
    totalMinutes: activities.reduce((a, b) => a + (b.minutes ?? 0), 0),
    planDone,
    planTotal,
    completionRate: planTotal === 0 ? 0 : planDone / planTotal,
    domainCounts,
    domainMinutes,
    topSkills,
    avgMood: avg(moods),
    avgSleep: avg(sleeps),
    avgEnergy: avg(energies),
    stateDays: states.length,
    srsReviews: srsCount,
    dueCards,
    missedDays,
    needsRelief: missedDays >= 2,
  };
}

/**
 * Tổng hợp tuần trước — để so sánh (task 15.1).
 */
export async function summarizePreviousWeek(
  input: Date | string | number = new Date(),
): Promise<WeeklyComparison> {
  const { start, end } = previousWeekRange(input);

  const [activityCount, totalMinutes, planItems, states, evidenceCount] = await Promise.all([
    prisma.activity.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.activity.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { minutes: true },
    }),
    prisma.planItem.findMany({
      where: { date: { gte: start, lte: end } },
      select: { done: true },
    }),
    prisma.dailyState.findMany({
      where: { date: { gte: start, lte: end } },
      select: { mood: true, sleep: true },
    }),
    prisma.evidence.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
  ]);

  const moods = states.map((s) => s.mood).filter((m): m is number => m !== null);
  const sleeps = states.map((s) => s.sleep).filter((s): s is number => s !== null);
  const avg = (xs: number[]): number | null =>
    xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

  const planTotal = planItems.length;
  const planDone = planItems.filter((p) => p.done).length;

  return {
    activityCount,
    totalMinutes: totalMinutes._sum.minutes ?? 0,
    planDone,
    planTotal,
    completionRate: planTotal === 0 ? 0 : planDone / planTotal,
    avgMood: avg(moods),
    avgSleep: avg(sleeps),
    evidenceCount,
  };
}

/**
 * Đếm số ngày **trượt** liên tiếp tính từ hôm nay (đi ngược).
 *
 * Ngày trượt = ngày có kế hoạch (>=1 `PlanItem`) nhưng **không** slot nào
 * `done`. Ngày không có kế hoạch (nghỉ) không tính là trượt.
 */
export async function countMissedDays(from: Date = startOfDay(new Date())): Promise<number> {
  const cursor = startOfDay(from);
  let missed = 0;

  // Lùi tối đa 30 ngày — đủ để phát hiện "trượt ≥2 ngày" mà không quét DB nhiều.
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(cursor, -i);
    const items = await prisma.planItem.findMany({
      where: { date: day },
      select: { done: true },
    });
    if (items.length === 0) break; // Không có kế hoạch → chuỗi trượt kết thúc.
    if (items.every((it) => !it.done)) {
      missed += 1;
    } else {
      break; // Có ngày làm được → chuỗi trượt kết thúc.
    }
  }

  return missed;
}

/**
 * Số slot nên dùng cho tuần sau — **giảm tải** khi trượt ≥2 ngày (FR-WR-05).
 *
 * Mặc định 6 slot. Khi trượt ≥2 ngày → 3 slot (nửa tải).
 */
export function plannedSlotCount(missedDays: number): number {
  return missedDays >= 2 ? 3 : 6;
}

/**
 * Ghi chú lý do giảm tải — hiển thị ở S13 cạnh đề xuất kế hoạch.
 */
export function reliefNote(missedDays: number): string | null {
  if (missedDays < 2) return null;
  return `Tuần trước trượt ${missedDays} ngày liên tiếp → giảm tải còn 3 slot, tập trung phần đã làm được.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 15.2 — chốt chạy Weekly Review đúng 1 lần / tuần
// ─────────────────────────────────────────────────────────────────────────────

/** Trạng thái lần chạy Weekly Review của 1 tuần. */
export type WeeklyRunState = {
  weekKey: string;
  /** Đã tạo báo cáo (có dòng trong `WeeklyReviewRun`) chưa. */
  exists: boolean;
  /** Đã áp dụng đề xuất kế hoạch chưa. */
  applied: boolean;
  slotCount: number;
  reliefNote: string | null;
};

/** Đọc trạng thái lần chạy của tuần chứa `input`. */
export async function getWeeklyRun(input: Date | string | number = new Date()): Promise<WeeklyRunState> {
  const key = weekKey(input);
  const run = await prisma.weeklyReviewRun.findUnique({ where: { weekKey: key } });
  return {
    weekKey: key,
    exists: run !== null,
    applied: run?.applied ?? false,
    slotCount: run?.slotCount ?? 0,
    reliefNote: run?.reliefNote ?? null,
  };
}

/**
 * Đảm bảo có 1 dòng `WeeklyReviewRun` cho tuần này — task 15.2.
 *
 * Dùng `upsert` nên gọi nhiều lần trong tuần vẫn chỉ có **1 dòng** → Weekly
 * Review không bao giờ chạy 2 lần.
 *
 * @param slotCount số slot cuối cùng đã đề xuất
 */
export async function ensureWeeklyRun(
  input: Date | string | number = new Date(),
  options: { slotCount?: number; reliefNote?: string | null } = {},
): Promise<WeeklyRunState> {
  const key = weekKey(input);
  const { start } = weekRange(input);

  const run = await prisma.weeklyReviewRun.upsert({
    where: { weekKey: key },
    create: {
      weekKey: key,
      weekStart: start,
      applied: false,
      slotCount: options.slotCount ?? 0,
      reliefNote: options.reliefNote ?? null,
    },
    update: {
      // Chỉ cập nhật `slotCount`/`reliefNote` khi có giá trị mới — không ghi đè
      // `applied` đã bật thành false.
      ...(options.slotCount !== undefined ? { slotCount: options.slotCount } : {}),
      ...(options.reliefNote !== undefined ? { reliefNote: options.reliefNote } : {}),
    },
  });

  return {
    weekKey: run.weekKey,
    exists: true,
    applied: run.applied,
    slotCount: run.slotCount,
    reliefNote: run.reliefNote,
  };
}

/** Đánh dấu đề xuất kế hoạch đã được duyệt & áp dụng. */
export async function markWeeklyApplied(
  input: Date | string | number = new Date(),
  slotCount: number,
): Promise<void> {
  const key = weekKey(input);
  const { start } = weekRange(input);
  await prisma.weeklyReviewRun.upsert({
    where: { weekKey: key },
    create: { weekKey: key, weekStart: start, applied: true, slotCount },
    update: { applied: true, slotCount },
  });
}

/**
 * Tuần có nên tự chạy Weekly Review không?
 *
 * Task 15.2: "Chủ nhật 20:00 hoặc lần mở đầu tuần". Vì app là local-first
 * (không có server cron), ta dùng quy tắc:
 *   - **Chủ Nhật** từ 20:00 → chạy.
 *   - **Thứ Hai** (đầu tuần mới) → chạy nếu tuần trước đã có dữ liệu.
 *
 * Cờ `WeeklyReviewRun.weekKey` đảm bảo không chạy 2 lần.
 */
export function shouldAutoRunWeeklyReview(now: Date = new Date()): boolean {
  const day = now.getDay(); // 0 = Chủ Nhật
  if (day === 0) {
    return now.getHours() >= 20;
  }
  if (day === 1) {
    return true; // Đầu tuần mới — chạy lần đầu của tuần này.
  }
  return false;
}

/** Khoá ngày dùng để so sánh nhanh — trả về chuỗi `YYYY-MM-DD`. */
export function weeklyDayKeys(input: Date | string | number = new Date()): string[] {
  const { start } = weekRange(input);
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
}
