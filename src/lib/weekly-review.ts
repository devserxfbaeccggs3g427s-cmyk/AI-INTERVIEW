/**
 * Lớp nghiệp vụ cho báo cáo tuần (S13) — AI-07 + kế hoạch tuần tới.
 *
 * ⚠️ P4: AI chỉ được chấm/nhận định theo rubric cố định — không tự bịa tiêu chí.
 * ⚠️ P6: local-first — offline thì vẫn có số liệu thật, chỉ ẩn khối AI.
 *
 * Nguồn: `.kiro/specs/weekly-progress-report/spec.md` §3.1 + design.md §3.
 */

import { z } from "zod";

import { prisma } from "@/lib/db";
import { addDays, normalizeDate, toDateKey } from "@/lib/dates";
import { DOMAINS, type DomainKey } from "@/lib/types";
import type { WeeklySummary } from "@/lib/analytics";
import { parseIsoWeek, toIsoWeek } from "@/lib/week";

/* ══ Schema (AI-07) ══════════════════════════════════════════════════════ */

export const WeeklyReviewSchema = z.object({
  insights: z.object({
    strength: z.object({
      title: z.string(),
      body: z.string(),
      evidence: z.string(),
    }),
    weakness: z.object({
      title: z.string(),
      body: z.string(),
      impact: z.string(),
    }),
    experiment: z.object({
      title: z.string(),
      body: z.string(),
      rationale: z.string(),
    }),
  }),
  plan: z.object({
    slots: z.array(
      z.object({
        slot: z.number().int().min(0).max(5),
        domain: z.enum(["professional", "communication", "language", "personal"]),
        action: z.string(),
        detail: z.string(),
        minutes: z.number().int().min(5).max(120),
        skillName: z.string().nullable(),
        startTime: z.string().nullable(),
        endTime: z.string().nullable(),
        focusHint: z.string().nullable(),
      }),
    ),
    reducedLoad: z.boolean(),
    reduceReason: z.string().nullable(),
  }),
});

export type WeeklyReviewPayload = z.infer<typeof WeeklyReviewSchema>;

export interface WeeklyInsights {
  strength: { title: string; body: string; evidence: string };
  weakness: { title: string; body: string; impact: string };
  experiment: { title: string; body: string; rationale: string };
}

export interface NextWeekPlanSlot {
  slot: number;
  domain: DomainKey;
  action: string;
  detail: string;
  minutes: number;
  skillId?: string | null;
  skillName: string | null;
  startTime?: string | null;
  endTime?: string | null;
  focusHint?: string | null;
}

export interface NextWeekPlan {
  slots: NextWeekPlanSlot[];
  reducedLoad: boolean;
  reduceReason?: string | null;
}

/** Schema body `POST /api/review/weekly/apply` — 6 slot, 0..5 không trùng. */
export const ApplyPlanSchema = z.object({
  week: z.string(),
  slots: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(5),
        domain: z.enum(["professional", "communication", "language", "personal"]),
        action: z.string().min(1).max(160),
        detail: z.string().max(200),
        minutes: z.number().int().min(5).max(120),
        skillId: z.string().nullable().optional(),
        skillName: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        focusHint: z.string().nullable().optional(),
      }),
    )
    .length(6),
  reducedLoad: z.boolean().default(false),
  reduceReason: z.string().nullable().optional(),
});

/* ══ Dựng plan từ payload AI ════════════════════════════════════════════ */

/**
 * Chuyển payload AI ⇒ `NextWeekPlan`.
 *
 * ⚠️ T2: AI trả sai số slot (≠ 6) ⇒ **không** tự cắt bừa — trả cảnh báo để
 * UI cho người dùng tự sửa.
 */
export function buildNextWeekPlan(payload: WeeklyReviewPayload): {
  plan: NextWeekPlan;
  warning: string | null;
} {
  const slots = payload.plan.slots.map((slot) => ({
    slot: slot.slot,
    domain: slot.domain as DomainKey,
    action: slot.action,
    detail: slot.detail,
    minutes: slot.minutes,
    skillId: null,
    skillName: slot.skillName,
    startTime: slot.startTime,
    endTime: slot.endTime,
    focusHint: slot.focusHint,
  }));

  const warning =
    slots.length !== 6
      ? `Kế hoạch AI trả về ${slots.length}/6 slot — bổ sung slot trống để người dùng tự điền`
      : null;

  return {
    plan: {
      slots,
      reducedLoad: payload.plan.reducedLoad,
      reduceReason: payload.plan.reduceReason,
    },
    warning,
  };
}

/**
 * Bù slot còn thiếu bằng **rule cục bộ** — không gọi AI, không bịa nội dung.
 */
export function fillMissingSlots(plan: NextWeekPlan): NextWeekPlan {
  if (plan.slots.length >= 6) return plan;

  const used = new Set(plan.slots.map((slot) => slot.slot));
  const defaults: Array<{ domain: DomainKey; action: string; detail: string; minutes: number }> = [
    { domain: "professional", action: "Học kỹ năng chuyên môn", detail: "Chọn 1 kỹ năng trong cây và học sâu", minutes: 30 },
    { domain: "communication", action: "Luyện giao tiếp", detail: "Viết hoặc nói 1 đoạn về chủ đề tuần này", minutes: 20 },
    { domain: "language", action: "Ôn ngoại ngữ bằng SRS", detail: "Ôn các thẻ đến hạn", minutes: 15 },
    { domain: "language", action: "Luyện ngoại ngữ chủ động", detail: "Luyện viết 1 câu ngắn bằng tiếng đích", minutes: 20 },
    { domain: "personal", action: "Nhật ký ngắn", detail: "Viết 3 dòng về điều đáng chú ý", minutes: 10 },
    { domain: "personal", action: "Chăm sóc thể chất", detail: "Đi bộ 20 phút hoặc tập 15 phút", minutes: 20 },
  ];

  const slots = [...plan.slots];
  let defaultIndex = 0;
  for (let slot = 0; slot < 6; slot += 1) {
    if (used.has(slot)) continue;
    const fallback = defaults[defaultIndex % defaults.length];
    defaultIndex += 1;
    slots.push({ ...fallback, slot, skillId: null, skillName: null });
  }

  slots.sort((a, b) => a.slot - b.slot);
  return { ...plan, slots };
}

/* ══ Áp dụng kế hoạch ═══════════════════════════════════════════════════ */

/**
 * Ghi kế hoạch tuần tới — 6 slot × 7 ngày = 42 `PlanItem`.
 *
 * ⚠️ AC-RP-5 / T3: xoá `source = "ai"` của tuần đích rồi insert trong **1
 * transaction** ⇒ duyệt 2 lần không nhân bản.
 */
export async function applyNextWeekPlan(input: {
  week: string;
  slots: NextWeekPlanSlot[];
  reducedLoad: boolean;
  reduceReason?: string | null;
}): Promise<number> {
  const range = parseIsoWeek(input.week);
  if (!range) throw new Error("invalid_week");

  const start = range.start;
  const end = addDays(start, 7);

  return prisma.$transaction(async (tx) => {
    await tx.planItem.deleteMany({
      where: { date: { gte: start, lt: end }, source: "ai" },
    });

    const rows = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, day);
      for (const slot of input.slots) {
        rows.push({
          date,
          slot: slot.slot,
          domain: slot.domain,
          action: slot.action,
          detail: slot.detail,
          minutes: slot.minutes,
          skillId: slot.skillId ?? null,
          done: false,
          source: "ai",
        });
      }
    }

    const result = await tx.planItem.createMany({ data: rows });
    return result.count;
  });
}

/* ══ Prompt (AI-07) ══════════════════════════════════════════════════════ */

/**
 * System prompt cố định cho AI-07.
 *
 * ⚠️ KHÔNG chứa ngày tháng / tên người dùng / UUID — nội dung biến động nằm
 * trong `messages`.
 */
export const WEEKLY_REVIEW_SYSTEM = `
Bạn là coach phát triển bản thân. Nhiệm vụ duy nhất: tổng hợp một tuần hoạt động
của người dùng thành 3 nhận định hành động được + kế hoạch 6 slot cho tuần sau.
Nguyên tắc:
- Chỉ dùng số liệu được cung cấp. Không bịa số liệu, tên kỹ năng hay hoạt động.
- Nhận định phải truy được về hành động cụ thể trong tuần.
- Nếu người dùng trượt từ 2 ngày liên tiếp trở lên: giảm tải (ít slot hơn hoặc
  thời lượng ngắn hơn) và nêu rõ lý do trong reduceReason.
- Không khuyến khích tăng cường độ khi người dùng đang kiệt sức.
- Trả lời bằng tiếng Việt.
`.trim();

/** Rubric cố định cho 3 loại nhận định (P4). */
export const RUBRIC_WEEKLY = `
Tiêu chuẩn cho 3 nhận định:
1. strength  — điều đã làm rất tốt: phải có bằng chứng cụ thể (ngày, số liệu, hành vi).
2. weakness  — điểm cần sửa: nêu rõ hậu quả (impact) đo được, không phải mỹ cảm.
3. experiment — nên thử tuần sau: 1 thay đổi duy nhất, có lý do (rationale).
`.trim();

/**
 * User message — toàn bộ dữ liệu tuần nằm ở `messages` (sau breakpoint cache).
 *
 * ⚠️ Không chứa `Date.now()` / UUID — giữ nguyên prompt cache.
 */
export function buildWeeklyUserMessage(
  summary: WeeklySummary,
  week: string,
): string {
  const lines: string[] = [
    `Tuần: ${week}`,
    `Khoảng: ${summary.range.start} → ${summary.range.end}`,
    "",
    "HOÀN THÀNH KẾ HOẠCH:",
    `  ${summary.completion.done}/${summary.completion.total} slot (${(summary.completion.rate * 100).toFixed(1)}%)`,
    summary.completion.priorRate !== null
      ? `  Tuần trước: ${(summary.completion.priorRate * 100).toFixed(1)}%`
      : "  Tuần trước: chưa có dữ liệu",
    `  Chuỗi kỷ luật: ${summary.streak} ngày`,
    `  Ngày trượt liên tiếp: ${summary.missedStreak}`,
    `  Số hoạt động trong tuần: ${summary.activityCount}`,
    "",
    "PHÂN BỔ 4 TRỤC:",
    ...summary.byDomain.map(
      (row) =>
        `  - ${row.domain}: ${row.done}/${row.total} (${(row.rate * 100).toFixed(0)}%)`,
    ),
    "",
    "NHỊP ĐỘ 7 NGÀY (slot xong/tổng · năng lượng):",
    ...summary.energy.map(
      (day) =>
        `  - ${day.weekday} ${day.date}: ${day.slotsDone}/${day.slotsTotal}${day.energyPct !== null ? ` · năng lượng ${day.energyPct.toFixed(0)}%` : " · chưa có chỉ số"}`,
    ),
    "",
    "TOP 3 KỸ NĂNG BỨT PHÁ:",
    summary.topSkills.length === 0
      ? "  (chưa có bằng chứng)"
      : summary.topSkills
          .map(
            (skill) =>
              `  - ${skill.name} (${skill.domain}): ${skill.evidenceCount} bằng chứng${skill.avgRating !== null ? ` · điểm TB ${skill.avgRating.toFixed(1)}` : ""}`,
          )
          .join("\n"),
    "",
    "CHỈ SỐ SINH TRẮC:",
    `  mood ${summary.bio.mood ?? "—"} · energy ${summary.bio.energy ?? "—"} · sleep ${summary.bio.sleep ?? "—"}h · focus ${summary.bio.focus ?? "—"}`,
    "",
    "FSRS RETENTION:",
    summary.retention.rate !== null
      ? `  ${(summary.retention.rate * 100).toFixed(1)}% (${summary.retention.successful}/${summary.retention.total} lượt ôn đạt chuẩn)`
      : "  (chưa có lượt ôn)",
    "",
    "MỤC TIÊU ĐANG ACTIVE:",
    summary.goal
      ? `  ${summary.goal.title} · hiện tại ${summary.goal.currentLevel ?? "—"} → đích ${summary.goal.targetLevel ?? "—"}${summary.goal.remainingLevels !== null ? ` · còn ${summary.goal.remainingLevels} bậc` : ""}${summary.goal.targetDate ? ` · hạn ${summary.goal.targetDate}` : " · chưa chốt ngày"}`
      : "  (chưa có mục tiêu)",
    "",
    summary.shouldReduceLoad
      ? "⚠️ Người dùng đã trượt từ 2 ngày liên tiếp — PHẢI giảm tải kế hoạch và nêu rõ lý do trong reduceReason."
      : "Kế hoạch tuần sau giữ tải tương đương tuần này trừ khi dữ liệu cho thấy cần giảm.",
    "",
    "Hãy sinh 3 nhận định + kế hoạch đúng 6 slot (slot 0..5, mỗi slot đúng 1 lần).",
  ];

  return lines.join("\n");
}

/* ══ Lưu insights để không gọi lại AI ════════════════════════════════════ */

/**
 * Lưu nhận định + kế hoạch vào `UserProfile.goals` (JSON) — nhánh dự phòng M11.
 *
 * Task 21.3: lần mở sau không gọi lại AI (tiết kiệm chi phí).
 */
export async function saveWeeklyInsights(input: {
  week: string;
  insights: WeeklyInsights;
  plan: NextWeekPlan;
}): Promise<void> {
  const profile = await prisma.userProfile.findFirst({ select: { goals: true } });
  const existing = parseStoredGoals(profile?.goals ?? null);
  const next = existing.filter((item) => item.week !== input.week);
  next.push({
    week: input.week,
    savedAt: toDateKey(new Date()),
    insights: input.insights,
    plan: input.plan,
  });

  await prisma.userProfile.updateMany({
    data: { goals: JSON.stringify(next) },
  });
}

/** Nhận định đã lưu của 1 tuần — `null` nếu chưa có. */
export async function getStoredInsights(
  week: string,
): Promise<{ insights: WeeklyInsights; plan: NextWeekPlan } | null> {
  const profile = await prisma.userProfile.findFirst({ select: { goals: true } });
  const stored = parseStoredGoals(profile?.goals ?? null).find((item) => item.week === week);
  if (!stored) return null;
  return { insights: stored.insights, plan: stored.plan };
}

interface StoredWeek {
  week: string;
  savedAt: string;
  insights: WeeklyInsights;
  plan: NextWeekPlan;
}

function parseStoredGoals(raw: string | null): StoredWeek[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredWeek =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredWeek).week === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Kế hoạch tuần tới — tuần kế tiếp sau `week`.
 */
export function nextWeekKey(week: string): string {
  const range = parseIsoWeek(week);
  if (!range) return week;
  const next = addDays(range.start, 7);
  return toIsoWeek(next);
}

/** Ngày bắt đầu tuần đích (Thứ Hai 00:00 local). */
export function weekStart(week: string): Date {
  const range = parseIsoWeek(week);
  return range ? range.start : normalizeDate(new Date());
}

/** Danh sách domain hợp lệ (helper cho UI). */
export const WEEKLY_DOMAINS = DOMAINS;
