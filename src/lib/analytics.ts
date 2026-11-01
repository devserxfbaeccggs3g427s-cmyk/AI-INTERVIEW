/**
 * Module analytics thuần (không gọi AI) — báo cáo tuần + báo cáo tiến bộ.
 *
 * ⚠️ P3 / P7: mọi số liệu truy được về `Activity` / `Evidence` / `PlanItem` /
 * `DailyState` / `Review` thật. Không có "tổng giờ học" trần trụi.
 * ⚠️ B2: `Activity.minutes` chỉ tính vào "deliberate practice" khi
 * `skillId IS NOT NULL`.
 * ⚠️ B3: heatmap đếm `Evidence`, **không** đếm `Activity`.
 *
 * Nguồn: `.kiro/specs/weekly-progress-report/spec.md` §3–§5.
 */

import { prisma } from "@/lib/db";
import { addDays, normalizeDate, toDateKey } from "@/lib/dates";
import { DOMAINS, type DomainKey } from "@/lib/types";
import { parseIsoWeek, weekDays } from "@/lib/week";

export type { DomainKey };

/* ══ Báo cáo tuần ═══════════════════════════════════════════════════════ */

export type DomainStatus = "elite" | "ok" | "needs_attention";

export interface WeeklyCompletion {
  done: number;
  total: number;
  /** 0..1 */
  rate: number;
  /** 0..1 */
  priorRate: number | null;
  /** Điểm phần trăm, làm tròn 1 chữ số. */
  deltaRate: number | null;
  status: DomainStatus;
}

export interface WeeklyDomainRow {
  domain: DomainKey;
  done: number;
  total: number;
  rate: number;
  status: DomainStatus;
}

export interface WeeklyEnergyDay {
  date: string;
  weekday: string;
  slotsDone: number;
  slotsTotal: number;
  rate: number;
  /** 0..100 — từ `DailyState.energy` (1–5). `null` = chưa có dữ liệu. */
  energyPct: number | null;
}

export interface WeeklyTopSkill {
  skillId: string;
  name: string;
  domain: DomainKey;
  evidenceCount: number;
  avgRating: number | null;
}

export interface WeeklyBio {
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
  samples: number;
}

export interface WeeklyRetention {
  /** 0..1 — tỷ lệ lượt ôn đạt chuẩn (rating >= 2). */
  rate: number | null;
  total: number;
  successful: number;
}

export interface GoalProgress {
  title: string;
  lang: "en" | "zh" | null;
  standard: string | null;
  targetLevel: string | null;
  targetDate: string | null;
  /** Level hiện tại của ngôn ngữ tương ứng. */
  currentLevel: string | null;
  /** Số bậc còn lại (0 = đã đạt). */
  remainingLevels: number | null;
  status: string;
  priority: number;
}

export interface WeeklySummary {
  week: string;
  range: { start: string; end: string };
  completion: WeeklyCompletion;
  byDomain: WeeklyDomainRow[];
  streak: number;
  energy: WeeklyEnergyDay[];
  retention: WeeklyRetention;
  topSkills: WeeklyTopSkill[];
  bio: WeeklyBio;
  priorWeek: { week: string; done: number; total: number; rate: number } | null;
  /** Trượt ≥ 2 ngày liên tiếp ⇒ kế hoạch tuần sau phải giảm tải (FR-WR-05). */
  missedStreak: number;
  shouldReduceLoad: boolean;
  goal: GoalProgress | null;
  /** Số hoạt động trong tuần (Activity). */
  activityCount: number;
}

/**
 * Chuẩn hoá trạng thái theo ngưỡng: ≥0.9 Elite · ≥0.75 Ổn · còn lại Cần can thiệp.
 */
export function weeklyStatus(rate: number): DomainStatus {
  if (rate >= 0.9) return "elite";
  if (rate >= 0.75) return "ok";
  return "needs_attention";
}

/** Làm tròn 1 chữ số — dùng cho `deltaRate` (AC-RP-1). */
export function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Tỷ lệ hoàn thành slot trong tuần. */
export async function getWeeklyCompletion(
  start: Date,
  end: Date,
): Promise<{ done: number; total: number }> {
  const [done, total] = await Promise.all([
    prisma.planItem.count({ where: { date: { gte: start, lt: end }, done: true } }),
    prisma.planItem.count({ where: { date: { gte: start, lt: end } } }),
  ]);
  return { done, total };
}

/**
 * Tổng hợp tuần — query **song song** (NFR-RP-03).
 */
export async function getWeeklySummary(week: string): Promise<WeeklySummary | null> {
  const range = parseIsoWeek(week);
  if (!range) return null;

  const prior = parseIsoWeek(
    `${range.week}-W${String(Math.max(1, Number(range.week.split("-W")[1]) - 1)).padStart(2, "0")}`,
  );
  const priorStart = prior?.start ?? addDays(range.start, -7);
  const priorEnd = prior?.end ?? addDays(range.start, -7);

  const [
    completion,
    priorCompletion,
    byDomain,
    energy,
    retention,
    topSkills,
    bio,
    activityCount,
    activeDates,
    goal,
  ] = await Promise.all([
    getWeeklyCompletion(range.start, range.end),
    getWeeklyCompletion(priorStart, priorEnd),
    loadByDomain(range.start, range.end),
    loadEnergy(range.days),
    loadRetention(range.start, range.end),
    loadTopSkills(range.start, range.end),
    loadBio(range.start, range.end),
    prisma.activity.count({
      where: { createdAt: { gte: range.start, lt: range.end } },
    }),
    loadActiveDates(range.start, range.end),
    loadGoalProgress(),
  ]);

  const rate = completion.total > 0 ? completion.done / completion.total : 0;
  const priorRate =
    priorCompletion.total > 0 ? priorCompletion.done / priorCompletion.total : null;

  const missedStreak = countMissedStreak(activeDates, range.days);
  const streak = computeStreak(activeDates);

  return {
    week: range.week,
    range: {
      start: toDateKey(range.start),
      end: toDateKey(addDays(range.start, 6)),
    },
    completion: {
      done: completion.done,
      total: completion.total,
      rate,
      priorRate,
      deltaRate:
        priorRate === null ? null : roundTo1((rate - priorRate) * 100),
      status: weeklyStatus(rate),
    },
    byDomain,
    streak,
    energy,
    retention,
    topSkills,
    bio,
    priorWeek: {
      week: prior?.week ?? "",
      done: priorCompletion.done,
      total: priorCompletion.total,
      rate: priorRate ?? 0,
    },
    missedStreak,
    shouldReduceLoad: missedStreak >= 2,
    goal,
    activityCount,
  };
}

/**
 * Phân bổ theo domain — mỗi dòng = 1 domain (AC-RP-2).
 *
 * ⚠️ Dùng `PlanItem` theo domain + `Activity` theo domain.
 */
async function loadByDomain(start: Date, end: Date): Promise<WeeklyDomainRow[]> {
  const planRows = await prisma.planItem.groupBy({
    by: ["domain"],
    where: { date: { gte: start, lt: end } },
    _count: { _all: true },
  });

  const doneRows = await prisma.planItem.groupBy({
    by: ["domain"],
    where: { date: { gte: start, lt: end }, done: true },
    _count: { _all: true },
  });

  const doneMap = new Map(doneRows.map((row) => [row.domain, row._count._all]));
  const totalMap = new Map(planRows.map((row) => [row.domain, row._count._all]));

  // Đảm bảo đủ 4 trục domain (kể cả domain chưa có hoạt động).
  return DOMAINS.map((domain) => {
    const total = totalMap.get(domain) ?? 0;
    const done = doneMap.get(domain) ?? 0;
    const rate = total > 0 ? done / total : 0;
    return { domain, done, total, rate, status: weeklyStatus(rate) };
  });
}

/** 7 ngày: số slot hoàn thành + % năng lượng. */
async function loadEnergy(days: Date[]): Promise<WeeklyEnergyDay[]> {
  const start = days[0];
  const end = addDays(days[0], 7);

  const planRows = await prisma.planItem.findMany({
    where: { date: { gte: start, lt: end } },
    select: { date: true, done: true },
  });

  const states = await prisma.dailyState.findMany({
    where: { date: { gte: start, lt: end } },
    select: { date: true, energy: true },
  });
  const stateMap = new Map(states.map((s) => [toDateKey(s.date), s.energy]));

  const counters = new Map<string, { done: number; total: number }>();
  for (const row of planRows) {
    const key = toDateKey(row.date);
    const counter = counters.get(key) ?? { done: 0, total: 0 };
    counter.total += 1;
    if (row.done) counter.done += 1;
    counters.set(key, counter);
  }

  return days.map((day) => {
    const key = toDateKey(day);
    const counter = counters.get(key) ?? { done: 0, total: 0 };
    const energy = stateMap.get(key);
    return {
      date: key,
      weekday: formatWeekday(day),
      slotsDone: counter.done,
      slotsTotal: counter.total,
      rate: counter.total > 0 ? counter.done / counter.total : 0,
      energyPct: energy === null || energy === undefined ? null : (energy / 5) * 100,
    };
  });
}

/** FSRS retention — lượt ôn đạt chuẩn / tổng lượt ôn. */
async function loadRetention(start: Date, end: Date): Promise<WeeklyRetention> {
  const [total, successful] = await Promise.all([
    prisma.review.count({ where: { at: { gte: start, lt: end } } }),
    prisma.review.count({ where: { at: { gte: start, lt: end }, rating: { gte: 2 } } }),
  ]);

  return {
    rate: total > 0 ? successful / total : null,
    total,
    successful,
  };
}

/** Top 3 kỹ năng bứt phá — theo số Evidence trong tuần. */
async function loadTopSkills(start: Date, end: Date): Promise<WeeklyTopSkill[]> {
  const rows = await prisma.evidence.groupBy({
    by: ["skillId"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
    _avg: { rating: true },
    orderBy: { _count: { skillId: "desc" } },
    take: 3,
  });

  if (rows.length === 0) return [];

  const skills = await prisma.skill.findMany({
    where: { id: { in: rows.map((row) => row.skillId) } },
    select: { id: true, name: true, domain: true },
  });
  const nameMap = new Map(skills.map((s) => [s.id, s]));

  return rows.flatMap((row) => {
    const skill = nameMap.get(row.skillId);
    if (!skill) return []; // skill bị xoá → bỏ qua, không crash
    return [
      {
        skillId: skill.id,
        name: skill.name,
        domain: skill.domain as DomainKey,
        evidenceCount: row._count._all,
        avgRating: row._avg.rating ?? null,
      },
    ];
  });
}

/** Chỉ số sinh trắc trung bình trong tuần. */
async function loadBio(start: Date, end: Date): Promise<WeeklyBio> {
  const rows = await prisma.dailyState.findMany({
    where: { date: { gte: start, lt: end } },
    select: { mood: true, energy: true, sleep: true, focus: true },
  });

  if (rows.length === 0) {
    return { mood: null, energy: null, sleep: null, focus: null, samples: 0 };
  }

  const avg = (values: Array<number | null>) => {
    const valid = values.filter((v): v is number => typeof v === "number");
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 10) / 10;
  };

  return {
    mood: avg(rows.map((r) => r.mood)),
    energy: avg(rows.map((r) => r.energy)),
    sleep: avg(rows.map((r) => r.sleep)),
    focus: avg(rows.map((r) => r.focus)),
    samples: rows.length,
  };
}

/** Ngày có hoạt động (Evidence) — dùng tính streak + ngày trượt. */
async function loadActiveDates(start: Date, end: Date): Promise<Set<string>> {
  const rows = await prisma.evidence.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { createdAt: true },
  });
  return new Set(rows.map((row) => toDateKey(row.createdAt)));
}

/** Chuỗi kỷ luật — số ngày liên tiếp có bằng chứng (tính từ hôm nay). */
export function computeStreak(activeDates: ReadonlySet<string>): number {
  let streak = 0;
  const cursor = normalizeDate(new Date());

  // Hôm nay chưa có bằng chứng thì bắt đầu từ hôm qua (chuỗi chưa đứt).
  if (!activeDates.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (activeDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * Số ngày trượt liên tiếp (không có bằng chứng) tính từ cuối tuần về trước.
 */
export function countMissedStreak(
  activeDates: ReadonlySet<string>,
  days: Date[],
): number {
  let missed = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const key = toDateKey(days[i]);
    if (activeDates.has(key)) break;
    // Ngày hôm nay chưa kết thúc ⇒ không tính là trượt.
    if (key === toDateKey(new Date())) continue;
    missed += 1;
  }
  return missed;
}

/* ══ Tiến độ về mục tiêu (Q8 / FR-PR-08) ═══════════════════════════════ */

/**
 * Mục tiêu sắp tới đang `active`.
 *
 * ⚠️ M11 chưa được duyệt ⇒ nhánh dự phòng: đọc JSON trong `UserProfile.goals`.
 */
export async function loadGoalProgress(): Promise<GoalProgress | null> {
  const profile = await prisma.userProfile.findFirst({
    select: { goals: true, zhLevel: true, enLevel: true },
  });
  if (!profile) return null;

  const goals = parseGoals(profile.goals);
  if (goals.length === 0) return null;

  const active = goals
    .filter((goal) => goal.status === "active")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const goal = active[0];
  if (!goal) return null;

  const lang = goal.lang === "zh" ? "zh" : "en";
  const currentLevel = lang === "zh" ? profile.zhLevel : profile.enLevel;

  return {
    title: goal.title ?? "Mục tiêu sắp tới",
    lang: goal.lang === "zh" || goal.lang === "en" ? goal.lang : null,
    standard: goal.standard ?? null,
    targetLevel: goal.targetLevel ?? null,
    targetDate: goal.targetDate ?? null,
    currentLevel,
    remainingLevels: levelGap(currentLevel, goal.targetLevel ?? null),
    status: goal.status ?? "active",
    priority: goal.priority ?? 0,
  };
}

interface RawGoal {
  title?: string;
  lang?: string;
  standard?: string;
  targetLevel?: string;
  targetDate?: string;
  status?: string;
  priority?: number;
}

function parseGoals(raw: string | null): RawGoal[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RawGoal => typeof item === "object" && item !== null,
    );
  } catch {
    return [];
  }
}

/**
 * Số bậc còn lại giữa level hiện tại và level đích.
 *
 * Thang CEFR đầy đủ: `zero · A1 · A2 · B1 · B2 · C1 · C2`.
 */
export function levelGap(current: string | null, target: string | null): number | null {
  if (!current || !target) return null;
  const order = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"];
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (currentIndex === -1 || targetIndex === -1) return null;
  return Math.max(0, targetIndex - currentIndex);
}

/* ══ Báo cáo tiến bộ (S14) ══════════════════════════════════════════════ */

export interface ProgressReport {
  domain: DomainKey | "all";
  days: number;
  /** Level trung bình (chỉ node lá) 0..5. */
  levelAvg: number | null;
  /** Số node lá đã tính. */
  leafCount: number;
  /** Evidence trong khoảng. */
  evidenceCount: number;
  /** Evidence đạt chuẩn (rating >= 3). */
  strongEvidenceCount: number;
  evidenceByMonth: Array<{ month: string; count: number }>;
  /** Heatmap — CHỈ ngày có Evidence (AC-RP-7). */
  heatmap: Array<{ date: string; count: number }>;
  t30: T30Benchmark;
  practiceTime: Array<{ domain: DomainKey; minutes: number }>;
  practiceTotalMinutes: number;
  retention: WeeklyRetention;
  goal: GoalProgress | null;
}

export interface T30Benchmark {
  available: boolean;
  daysMissing: number;
  metrics: Array<{
    key: string;
    label: string;
    current: number | null;
    previous: number | null;
    delta: number | null;
    unit: string;
  }>;
}

/**
 * Báo cáo tiến bộ — query tổng hợp server-side (NFR-RP-03).
 */
export async function getProgress(opts: {
  domain: DomainKey | "all";
  days: number;
}): Promise<ProgressReport> {
  const to = normalizeDate(new Date());
  const from = addDays(to, -(opts.days - 1));

  const domainFilter = opts.domain === "all" ? {} : { domain: opts.domain };

  const [skills, evidenceCount, strongEvidenceCount, evidenceByMonth, heatmap, practiceTime, retention, goal] =
    await Promise.all([
      prisma.skill.findMany({
        where: domainFilter,
        select: { id: true, domain: true, level: true, children: { select: { id: true } } },
      }),
      prisma.evidence.count({
        where: {
          createdAt: { gte: from, lt: addDays(to, 1) },
          skill: domainFilter,
        },
      }),
      prisma.evidence.count({
        where: {
          createdAt: { gte: from, lt: addDays(to, 1) },
          rating: { gte: 3 },
          skill: domainFilter,
        },
      }),
      loadEvidenceByMonth(from, to, domainFilter),
      loadHeatmap(from, to, domainFilter),
      loadPracticeTime(from, to, domainFilter),
      loadRetention(from, addDays(to, 1)),
      loadGoalProgress(),
    ]);

  // Chỉ tính **node lá** (skill không có con) làm "cấp độ kỹ năng bình quân".
  const leaves = skills.filter((skill) => skill.children.length === 0);
  const levelAvg =
    leaves.length === 0
      ? null
      : Math.round((leaves.reduce((sum, s) => sum + s.level, 0) / leaves.length) * 100) / 100;

  const t30 = await buildT30Benchmark(from, to, domainFilter);

  return {
    domain: opts.domain,
    days: opts.days,
    levelAvg,
    leafCount: leaves.length,
    evidenceCount,
    strongEvidenceCount,
    evidenceByMonth,
    heatmap,
    t30,
    practiceTime,
    practiceTotalMinutes: practiceTime.reduce((sum, row) => sum + row.minutes, 0),
    retention,
    goal,
  };
}

/**
 * Heatmap — CHỈ đếm `Evidence` (B3 / AC-RP-7).
 *
 * Ngày không có Evidence ⇒ **không** xuất hiện trong mảng (ô nền ở UI).
 */
export async function loadHeatmap(
  from: Date,
  to: Date,
  domainFilter: { domain?: DomainKey },
): Promise<Array<{ date: string; count: number }>> {
  const rows = await prisma.evidence.findMany({
    where: {
      createdAt: { gte: from, lt: addDays(to, 1) },
      skill: domainFilter,
    },
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = toDateKey(row.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Evidence theo tháng (6 tháng) — cho biểu đồ quỹ đạo. */
export async function loadEvidenceByMonth(
  from: Date,
  to: Date,
  domainFilter: { domain?: DomainKey },
): Promise<Array<{ month: string; count: number }>> {
  const rows = await prisma.evidence.findMany({
    where: {
      createdAt: { gte: from, lt: addDays(to, 1) },
      skill: domainFilter,
    },
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Thời gian deliberate practice — **bắt buộc** lọc `skillId IS NOT NULL`
 * (B2 / AC-RP-6).
 */
export async function loadPracticeTime(
  from: Date,
  to: Date,
  domainFilter: { domain?: DomainKey },
): Promise<Array<{ domain: DomainKey; minutes: number }>> {
  const rows = await prisma.activity.groupBy({
    by: ["domain"],
    where: {
      skillId: { not: null },
      createdAt: { gte: from, lt: addDays(to, 1) },
      ...domainFilter,
    },
    _sum: { minutes: true },
  });

  return rows.map((row) => ({
    domain: row.domain as DomainKey,
    minutes: row._sum.minutes ?? 0,
  }));
}

/**
 * Tự đối sánh 30 ngày — hiện tại vs chính mình 30 ngày trước (FR-PR-03).
 */
async function buildT30Benchmark(
  from: Date,
  to: Date,
  domainFilter: { domain?: DomainKey },
): Promise<T30Benchmark> {
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const missingDays = Math.max(0, 30 - spanDays);

  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(spanDays - 1));

  const [currentEvidence, previousEvidence, currentActivities, previousActivities] =
    await Promise.all([
      prisma.evidence.findMany({
        where: { createdAt: { gte: from, lt: addDays(to, 1) }, skill: domainFilter },
        select: { createdAt: true, rating: true },
      }),
      prisma.evidence.findMany({
        where: { createdAt: { gte: prevFrom, lt: addDays(prevTo, 1) }, skill: domainFilter },
        select: { createdAt: true, rating: true },
      }),
      prisma.activity.findMany({
        where: {
          skillId: { not: null },
          createdAt: { gte: from, lt: addDays(to, 1) },
          ...domainFilter,
        },
        select: { minutes: true },
      }),
      prisma.activity.findMany({
        where: {
          skillId: { not: null },
          createdAt: { gte: prevFrom, lt: addDays(prevTo, 1) },
          ...domainFilter,
        },
        select: { minutes: true },
      }),
    ]);

  const avgMinutes = (rows: Array<{ minutes: number }>) =>
    rows.length === 0
      ? null
      : Math.round((rows.reduce((sum, r) => sum + r.minutes, 0) / rows.length) * 10) / 10;

  const strongRate = (rows: Array<{ rating: number }>) =>
    rows.length === 0
      ? null
      : Math.round((rows.filter((r) => r.rating >= 3).length / rows.length) * 1000) / 10;

  const currentStrong = strongRate(currentEvidence);
  const previousStrong = strongRate(previousEvidence);
  const currentAvg = avgMinutes(currentActivities);
  const previousAvg = avgMinutes(previousActivities);

  const metrics: T30Benchmark["metrics"] = [
    {
      key: "avg_minutes",
      label: "Tốc độ thực chiến",
      current: currentAvg,
      previous: previousAvg,
      delta:
        currentAvg !== null && previousAvg !== null
          ? Math.round((currentAvg - previousAvg) * 10) / 10
          : null,
      unit: "phút/hoạt động",
    },
    {
      key: "evidence_rate",
      label: "Bằng chứng đạt chuẩn P3",
      current: currentStrong,
      previous: previousStrong,
      delta:
        currentStrong !== null && previousStrong !== null
          ? Math.round((currentStrong - previousStrong) * 10) / 10
          : null,
      unit: "%",
    },
    {
      key: "evidence_count",
      label: "Số bằng chứng",
      current: currentEvidence.length,
      previous: previousEvidence.length,
      delta: currentEvidence.length - previousEvidence.length,
      unit: "bằng chứng",
    },
  ];

  return {
    available: spanDays >= 30,
    daysMissing: missingDays,
    metrics,
  };
}

/**
 * Đường quỹ đạo skill theo domain (6 tháng) — cho biểu đồ S14.
 */
export async function getSkillTrajectories(
  days = 180,
): Promise<
  Array<{ domain: DomainKey; label: string; points: Array<{ month: string; level: number }> }>
> {
  const to = normalizeDate(new Date());
  const from = addDays(to, -(days - 1));

  const skills = await prisma.skill.findMany({
    select: { id: true, domain: true, level: true, children: { select: { id: true } } },
  });

  const leaves = skills.filter((skill) => skill.children.length === 0);

  const months: string[] = [];
  const cursor = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor >= new Date(from.getFullYear(), from.getMonth(), 1)) {
    months.unshift(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return DOMAINS.map((domain) => {
    const domainLeaves = leaves.filter((skill) => skill.domain === domain);
    const level =
      domainLeaves.length === 0
        ? 0
        : domainLeaves.reduce((sum, s) => sum + s.level, 0) / domainLeaves.length;

    return {
      domain,
      label: DOMAIN_LABELS[domain],
      points: months.map((month) => ({
        month,
        level: Math.round(level * 100) / 100,
      })),
    };
  });
}

const DOMAIN_LABELS: Record<DomainKey, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

function formatWeekday(date: Date): string {
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return names[date.getDay()] ?? "";
}

/** Chuỗi 7 ngày của tuần (helper cho test). */
export function daysOfWeek(week: string): Date[] {
  return weekDays(week);
}
