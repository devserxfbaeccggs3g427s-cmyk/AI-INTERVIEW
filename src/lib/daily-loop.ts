/**
 * Lớp nghiệp vụ Daily Loop — đọc/ghi kế hoạch, tính streak & năng lượng tuần.
 *
 * ⚠️ KHÔNG import React. KHÔNG import `@anthropic-ai/sdk` (chỉ `ai-foundation`
 * được import SDK — registry §5).
 */

import { EVIDENCE_THRESHOLD, SLOT_CONTRACTS, SLOT_COUNT, SLOT_DOMAINS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { addDays, daysBetween, normalizeDate, toDateKey, todayKey } from "@/lib/dates";
import type { Domain } from "@/lib/prompts";
import { resolveCurrentStage, shouldReduceLoad, type StageProgress } from "@/lib/stages";
import type { PlanSource, SlotKind } from "@/lib/types";

export type { Domain, PlanSource, SlotKind };

/* ══ Types ═════════════════════════════════════════════════════════════════ */

export interface PlanSlotDTO {
  /** 0..5 — thứ tự ưu tiên trong ngày. */
  slot: number;
  /** Thuộc tính của item (P5) — đi theo item khi kéo đổi. */
  domain: Domain;
  /** Suy ra từ vị trí slot gốc. */
  kind: SlotKind;
  action: string;
  detail: string | null;
  minutes: number;
  skillId: string | null;
  skillName: string | null;
  done: boolean;
  source: PlanSource;
}

export interface WeeklyEnergy {
  /** 0..100 — làm tròn nguyên. */
  pct: number;
  doneSlots: number;
  /** Chỉ tính ngày CÓ kế hoạch. */
  totalSlots: number;
  daysWithPlan: number;
  /** Luôn 7. */
  daysInWindow: number;
  /** false ⇒ chưa có dữ liệu tuần → UI hiện "—" chứ không hiện 0%. */
  hasData: boolean;
}

export interface PlanForDate {
  date: string;
  items: PlanSlotDTO[];
  doneCount: number;
  totalCount: number;
  source: PlanSource | "mixed";
  weeklyEnergy: WeeklyEnergy;
  streak: number;
}

export interface FocusSkill {
  skill: {
    id: string;
    name: string;
    domain: Domain;
    level: number;
    targetLevel: number;
  };
  evidenceCount: number;
  strongEvidenceCount: number;
  minutesAccumulated: number;
  /** 0..100 — (strongEvidence / EVIDENCE_THRESHOLD) * 100, clamp. */
  criteriaProgressPct: number;
}

export interface SlotContract {
  slot: number;
  domain: Domain;
  kind: SlotKind;
  minMinutes: number;
  maxMinutes: number;
  content: string;
}

export interface PlanContext {
  date: string;
  weekday: string;
  skills: Array<{
    id: string;
    name: string;
    domain: Domain;
    level: number;
    targetLevel: number;
    evidenceCount: number;
    strongEvidenceCount: number;
    parentName: string | null;
  }>;
  dailyState: {
    mood: number | null;
    energy: number | null;
    sleep: number | null;
    focus: number | null;
  } | null;
  last7Days: Array<{ date: string; doneSlots: number; totalSlots: number; minutes: number }>;
  /** Slot `done = true` → bất biến, AI không được đề xuất lại. */
  lockedSlots: PlanSlotDTO[];
  slotContract: SlotContract[];
}

export class PlanItemNotFoundError extends Error {
  constructor(readonly slot: number) {
    super(`Không tìm thấy plan item cho slot ${slot}`);
    this.name = "PlanItemNotFoundError";
  }
}

/* ══ Tính toán thuần (không I/O) ══════════════════════════════════════════ */

/**
 * Streak = số ngày liên tiếp (tính tới `today`) có ít nhất 1 Activity.
 * Hôm nay chưa có Activity ⇒ streak đếm từ hôm trước (không reset giữa ngày).
 */
export function computeStreak(activeDates: ReadonlySet<string>, today: string): number {
  if (activeDates.size === 0) return 0;

  const [year, month, day] = today.split("-").map(Number);
  let cursor = new Date(year, month - 1, day);
  let streak = 0;

  // Nếu hôm nay chưa có hoạt động → bắt đầu từ hôm qua (không reset).
  if (!activeDates.has(toDateKey(cursor))) {
    cursor = addDays(cursor, -1);
  }

  // Giới hạn 365 ngày để tránh vòng lặp vô hạn nếu set chứa ngày ở xa.
  for (let i = 0; i < 365; i++) {
    if (!activeDates.has(toDateKey(cursor))) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * Năng lượng tuần 0..100% = round(100 * doneSlots / totalSlots).
 * totalSlots CHỈ tính ngày có kế hoạch (totalSlots > 0).
 */
export function computeWeeklyEnergy(
  days: ReadonlyArray<{ date: string; doneSlots: number; totalSlots: number }>,
): WeeklyEnergy {
  const doneSlots = days.reduce((sum, day) => sum + day.doneSlots, 0);
  const totalSlots = days.reduce((sum, day) => sum + day.totalSlots, 0);
  const daysWithPlan = days.filter((day) => day.totalSlots > 0).length;

  return {
    pct: totalSlots > 0 ? Math.round((100 * doneSlots) / totalSlots) : 0,
    doneSlots,
    totalSlots,
    daysWithPlan,
    daysInWindow: 7,
    hasData: totalSlots > 0,
  };
}

/**
 * Merge kế hoạch mới vào kế hoạch hiện có.
 * - Slot `done = true` ⇒ GIỮ NGUYÊN toàn bộ.
 * - Slot `done = false` ⇒ lấy nội dung mới từ `incoming`.
 * - `incoming` thiếu slot ⇒ giữ slot cũ (không xoá).
 * - Không mutate input.
 */
export function mergeRegeneratedPlan(
  existing: ReadonlyArray<PlanSlotDTO>,
  incoming: ReadonlyArray<PlanSlotDTO>,
): { merged: PlanSlotDTO[]; keptDone: number; changedSlots: number } {
  const incomingBySlot = new Map(incoming.map((item) => [item.slot, item]));

  let keptDone = 0;
  let changedSlots = 0;

  const merged = existing.map((current) => {
    if (current.done) {
      keptDone += 1;
      return current; // bất biến
    }

    const next = incomingBySlot.get(current.slot);
    if (!next) return current; // incoming thiếu slot → giữ slot cũ

    const changed =
      next.action !== current.action ||
      next.detail !== current.detail ||
      next.minutes !== current.minutes ||
      next.skillId !== current.skillId ||
      next.domain !== current.domain;

    if (changed) changedSlots += 1;

    return {
      ...next,
      done: false, // slot mới luôn chưa xong
    };
  });

  // Slot có trong incoming nhưng không có trong existing → thêm vào (đủ 6 slot).
  const existingSlots = new Set(existing.map((item) => item.slot));
  for (const item of incoming) {
    if (!existingSlots.has(item.slot)) {
      merged.push({ ...item, done: false });
      changedSlots += 1;
    }
  }

  merged.sort((a, b) => a.slot - b.slot);
  return { merged, keptDone, changedSlots };
}

/** Kiểm bất biến 4 trục: {professional:1, communication:1, language:2, personal:2}. */
export function validateDomainMix(items: ReadonlyArray<{ domain: Domain }>): {
  ok: boolean;
  counts: Record<Domain, number>;
  message?: string;
} {
  const counts: Record<Domain, number> = {
    professional: 0,
    communication: 0,
    language: 0,
    personal: 0,
  };

  for (const item of items) {
    counts[item.domain] += 1;
  }

  const expected: Record<Domain, number> = {
    professional: 1,
    communication: 1,
    language: 2,
    personal: 2,
  };

  const ok = (Object.keys(expected) as Domain[]).every(
    (domain) => counts[domain] === expected[domain],
  );

  return {
    ok,
    counts,
    ...(ok
      ? {}
      : {
          message: `Tập domain phải là 1 chuyên môn · 1 giao tiếp · 2 ngoại ngữ · 2 cá nhân. Thực tế: ${JSON.stringify(counts)}`,
        }),
  };
}

/** Suy ra `kind` + khoảng thời lượng hợp lệ từ vị trí slot gốc (0..5). */
export function slotContract(slot: number): SlotContract {
  const contract = SLOT_CONTRACTS[slot];
  if (!contract) {
    throw new Error(`Slot ${slot} không hợp lệ (0..${SLOT_COUNT - 1})`);
  }
  return {
    slot: contract.slot,
    domain: SLOT_DOMAINS[contract.slot],
    kind: contract.kind,
    minMinutes: contract.minMinutes,
    maxMinutes: contract.maxMinutes,
    content: contract.content,
  };
}

/** Clamp `minutes` về khoảng hợp lệ của slot. */
export function clampMinutes(slot: number, minutes: number): number {
  const contract = SLOT_CONTRACTS[slot];
  if (!contract) return minutes;
  return Math.min(contract.maxMinutes, Math.max(contract.minMinutes, minutes));
}

/* ══ Truy vấn ═════════════════════════════════════════════════════════════ */

/** Chuyển row `PlanItem` → DTO. `skillName` lấy từ cây kỹ năng nếu còn tồn tại. */
function toDTO(row: PlanItemRow, skillNames: Map<string, string>): PlanSlotDTO {
  const contract = SLOT_CONTRACTS[row.slot];
  return {
    slot: row.slot,
    domain: row.domain as Domain,
    kind: contract?.kind ?? "study",
    action: row.action,
    detail: row.detail,
    minutes: row.minutes,
    skillId: row.skillId,
    // Skill bị xoá → skillId trỏ tới id không còn → UI bỏ qua, không crash.
    skillName: row.skillId ? (skillNames.get(row.skillId) ?? null) : null,
    done: row.done,
    source: row.source as PlanSource,
  };
}

interface PlanItemRow {
  id: string;
  slot: number;
  domain: string;
  action: string;
  detail: string | null;
  minutes: number;
  skillId: string | null;
  done: boolean;
  source: string;
}

/** Lấy tên kỹ năng cho một danh sách skillId (bỏ qua id không tồn tại). */
async function loadSkillNames(skillIds: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(skillIds.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();

  const skills = await prisma.skill.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(skills.map((s) => [s.id, s.name]));
}

export async function getPlanItems(date: Date): Promise<PlanSlotDTO[]> {
  const day = normalizeDate(date);
  const rows = await prisma.planItem.findMany({
    where: { date: day },
    orderBy: { slot: "asc" },
    select: {
      id: true,
      slot: true,
      domain: true,
      action: true,
      detail: true,
      minutes: true,
      skillId: true,
      done: true,
      source: true,
    },
  });

  const skillNames = await loadSkillNames(rows.map((r) => r.skillId));
  return rows.map((row) => toDTO(row, skillNames));
}

/** Danh sách ngày có kế hoạch — gần nhất trước. */
export async function listPlanDates(limit = 30): Promise<string[]> {
  const rows = await prisma.planItem.findMany({
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "desc" },
    take: limit,
  });

  return rows.map((row) => toDateKey(row.date));
}

/** Số ngày liên tiếp có ít nhất 1 Activity — tính tới hôm nay. */
export async function computeCurrentStreak(today: Date = new Date()): Promise<number> {
  const from = addDays(normalizeDate(today), -365);
  const activities = await prisma.activity.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true },
  });

  const activeDates = new Set(activities.map((a) => toDateKey(a.createdAt)));
  return computeStreak(activeDates, toDateKey(today));
}

/** Năng lượng tuần — 7 ngày gần nhất (kể cả hôm nay). */
export async function computeCurrentWeeklyEnergy(
  today: Date = new Date(),
): Promise<WeeklyEnergy> {
  const days = await getLast7Days(today);
  return computeWeeklyEnergy(days);
}

/** Thống kê 7 ngày gần nhất: số slot xong / tổng slot / tổng phút. */
export async function getLast7Days(
  today: Date = new Date(),
): Promise<Array<{ date: string; doneSlots: number; totalSlots: number; minutes: number }>> {
  const base = normalizeDate(today);
  const from = addDays(base, -6);

  const rows = await prisma.planItem.findMany({
    where: { date: { gte: from, lte: base } },
    select: { date: true, done: true, minutes: true },
  });

  const byDate = new Map<
    string,
    { doneSlots: number; totalSlots: number; minutes: number }
  >();

  for (let i = 0; i < 7; i++) {
    const key = toDateKey(addDays(from, i));
    byDate.set(key, { doneSlots: 0, totalSlots: 0, minutes: 0 });
  }

  for (const row of rows) {
    const key = toDateKey(row.date);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.totalSlots += 1;
    if (row.done) bucket.doneSlots += 1;
    // Chỉ tính phút của slot đã xong — "cam kết" không phải "đã làm".
    if (row.done) bucket.minutes += row.minutes;
  }

  return [...byDate.entries()].map(([date, stats]) => ({ date, ...stats }));
}

export async function getPlanForDate(date: Date): Promise<PlanForDate> {
  const items = await getPlanItems(date);
  const doneCount = items.filter((item) => item.done).length;

  const sources = new Set(items.map((item) => item.source));
  const source: PlanSource | "mixed" =
    sources.size === 0 ? "fallback" : sources.size === 1 ? ([...sources][0] as PlanSource) : "mixed";

  return {
    date: toDateKey(date),
    items,
    doneCount,
    totalCount: items.length,
    source,
    weeklyEnergy: await computeCurrentWeeklyEnergy(date),
    streak: await computeCurrentStreak(date),
  };
}

/**
 * Kỹ năng trọng tâm hôm nay.
 * Ưu tiên `UserProfile.focusSkillId`; nếu không có → skill có ít bằng chứng nhất
 * trong domain `professional` (kỹ năng nghề nghiệp).
 */
export async function getFocusSkill(_date: Date = new Date()): Promise<FocusSkill | null> {
  const profile = await prisma.userProfile.findFirst({
    select: { focusSkillId: true },
  });

  let skill = profile?.focusSkillId
    ? await prisma.skill.findUnique({
        where: { id: profile.focusSkillId },
        select: {
          id: true,
          name: true,
          domain: true,
          level: true,
          targetLevel: true,
          evidences: { select: { rating: true } },
          activities: { select: { minutes: true } },
        },
      })
    : null;

  if (!skill) {
    // Không có focusSkillId → chọn skill chuyên môn có ít bằng chứng mạnh nhất.
    const candidates = await prisma.skill.findMany({
      where: { domain: "professional", parentId: { not: null } },
      select: {
        id: true,
        name: true,
        domain: true,
        level: true,
        targetLevel: true,
        evidences: { select: { rating: true } },
        activities: { select: { minutes: true } },
      },
    });

    skill =
      candidates
        .filter((c) => c.evidences.filter((e) => e.rating >= 3).length < EVIDENCE_THRESHOLD)
        .sort(
          (a, b) =>
            a.evidences.filter((e) => e.rating >= 3).length -
              b.evidences.filter((e) => e.rating >= 3).length || a.id.localeCompare(b.id),
        )[0] ?? null;
  }

  if (!skill) return null;

  const strongEvidenceCount = skill.evidences.filter((e) => e.rating >= 3).length;
  const minutesAccumulated = skill.activities.reduce((sum, a) => sum + a.minutes, 0);

  return {
    skill: {
      id: skill.id,
      name: skill.name,
      domain: skill.domain as Domain,
      level: skill.level,
      targetLevel: skill.targetLevel,
    },
    evidenceCount: skill.evidences.length,
    strongEvidenceCount,
    minutesAccumulated,
    criteriaProgressPct: Math.min(
      100,
      Math.round((strongEvidenceCount / EVIDENCE_THRESHOLD) * 100),
    ),
  };
}

/**
 * Dựng `PlanContext` — toàn bộ dữ liệu biến động cho AI-01.
 * Mọi thứ ở đây nằm trong `messages`, KHÔNG nằm trong `system`.
 */
export async function getPlanContext(date: Date = new Date()): Promise<PlanContext> {
  const day = normalizeDate(date);
  const dateKey = toDateKey(day);

  const [skills, dailyState, items, last7Days] = await Promise.all([
    prisma.skill.findMany({
      select: {
        id: true,
        name: true,
        domain: true,
        level: true,
        targetLevel: true,
        parent: { select: { name: true } },
        evidences: { select: { rating: true } },
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    prisma.dailyState.findUnique({
      where: { date: day },
      select: { mood: true, energy: true, sleep: true, focus: true },
    }),
    getPlanItems(day),
    getLast7Days(day),
  ]);

  return {
    date: dateKey,
    weekday: formatWeekday(day),
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      domain: skill.domain as Domain,
      level: skill.level,
      targetLevel: skill.targetLevel,
      evidenceCount: skill.evidences.length,
      strongEvidenceCount: skill.evidences.filter((e) => e.rating >= 3).length,
      parentName: skill.parent?.name ?? null,
    })),
    dailyState,
    last7Days,
    lockedSlots: items.filter((item) => item.done),
    slotContract: SLOT_CONTRACTS.map((contract) => ({
      slot: contract.slot,
      domain: SLOT_DOMAINS[contract.slot],
      kind: contract.kind,
      minMinutes: contract.minMinutes,
      maxMinutes: contract.maxMinutes,
      content: contract.content,
    })),
  };
}

const WEEKDAY_VI = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

export function formatWeekday(date: Date): string {
  return WEEKDAY_VI[date.getDay()];
}

/* ══ Ghi dữ liệu ══════════════════════════════════════════════════════════ */

/**
 * Đánh dấu 1 slot hoàn thành (FR-DL-03).
 *
 * Idempotent: slot đã done ⇒ trả `alreadyDone: true`, KHÔNG tạo Activity/Evidence lần 2.
 * Tạo Activity + (Evidence nếu có skillId) + update `PlanItem.done` trong 1 transaction.
 *
 * P3: bấm "Xong" KHÔNG tăng `Skill.level` — chỉ tạo bằng chứng.
 */
export async function completePlanItem(input: {
  date: Date;
  slot: number;
  /** 1..5 → `Evidence.rating` (mặc định 3). */
  quality?: number;
  /** Mặc định = `PlanItem.minutes`. */
  minutes?: number;
  note?: string;
}): Promise<{
  activityId: string | null;
  evidenceId: string | null;
  planItem: PlanSlotDTO | null;
  alreadyDone: boolean;
}> {
  const day = normalizeDate(input.date);

  return prisma.$transaction(async (tx) => {
    const planItem = await tx.planItem.findFirst({
      where: { date: day, slot: input.slot },
    });

    if (!planItem) {
      throw new PlanItemNotFoundError(input.slot);
    }

    // Idempotent — đã xong rồi thì không tạo gì thêm.
    if (planItem.done) {
      const skillNames = await loadSkillNames([planItem.skillId]);
      return {
        activityId: null,
        evidenceId: null,
        planItem: toDTO(planItem, skillNames),
        alreadyDone: true,
      };
    }

    const rating = Math.min(4, Math.max(1, input.quality ?? 3));
    const minutes = input.minutes ?? planItem.minutes;

    const activity = await tx.activity.create({
      data: {
        skillId: planItem.skillId,
        domain: planItem.domain,
        type: activityTypeForSlot(planItem.slot),
        minutes,
        title: planItem.action,
        content: input.note ?? planItem.detail,
        quality: input.quality ?? null,
      },
    });

    // Evidence chỉ tạo khi slot gắn kỹ năng (P3).
    let evidenceId: string | null = null;
    if (planItem.skillId) {
      const evidence = await tx.evidence.create({
        data: {
          activityId: activity.id,
          skillId: planItem.skillId,
          rating,
        },
      });
      evidenceId = evidence.id;
    }

    await tx.planItem.update({
      where: { id: planItem.id },
      data: { done: true },
    });

    const skillNames = await loadSkillNames([planItem.skillId]);
    return {
      activityId: activity.id,
      evidenceId,
      planItem: { ...toDTO(planItem, skillNames), done: true },
      alreadyDone: false,
    };
  });
}

/** Loại `Activity.type` theo slot gốc. */
export function activityTypeForSlot(slot: number): string {
  switch (slot) {
    case 0:
      return "study";
    case 1:
      return "speak";
    case 2:
      return "srs";
    case 3:
      return "write";
    case 4:
      return "journal";
    case 5:
      return "health";
    default:
      return "custom";
  }
}

/**
 * Duyệt & áp dụng kế hoạch (S02).
 *
 * Trong 1 transaction:
 *   - xoá `PlanItem` của ngày đích **chỉ khi `done = false`** (giữ row done = true)
 *   - tạo lại các slot còn lại
 *
 * Idempotent: duyệt 2 lần không nhân bản, không mất bằng chứng.
 */
export async function applyPlan(input: {
  date: Date;
  items: ReadonlyArray<{
    slot: number;
    domain: Domain;
    action: string;
    detail: string | null;
    minutes: number;
    skillId: string | null;
  }>;
  source?: PlanSource;
}): Promise<{ applied: number; keptDone: number; totalMinutes: number }> {
  const day = normalizeDate(input.date);
  const source = input.source ?? "ai";

  return prisma.$transaction(async (tx) => {
    const doneRows = await tx.planItem.findMany({
      where: { date: day, done: true },
      select: { slot: true },
    });
    const doneSlots = new Set(doneRows.map((row) => row.slot));

    // Xoá các slot CHƯA xong — giữ nguyên slot đã xong (bất biến).
    await tx.planItem.deleteMany({ where: { date: day, done: false } });

    let applied = 0;
    let totalMinutes = 0;

    for (const item of input.items) {
      if (doneSlots.has(item.slot)) continue; // slot đã xong → giữ nguyên row cũ

      await tx.planItem.create({
        data: {
          date: day,
          slot: item.slot,
          domain: item.domain,
          action: item.action,
          detail: item.detail,
          minutes: item.minutes,
          skillId: item.skillId,
          done: false,
          source,
        },
      });

      applied += 1;
      totalMinutes += item.minutes;
    }

    return { applied, keptDone: doneSlots.size, totalMinutes };
  });
}

/** Khoảng cách ngày từ hôm nay (0 = hôm nay, 1 = hôm qua). */
export function daysAgo(date: Date, today: Date = new Date()): number {
  return daysBetween(date, today);
}

export { todayKey };

/**
 * Bỏ đánh dấu hoàn thành (R-DL-5 — "có đường bỏ đánh dấu").
 *
 * Xoá `Activity` tương ứng + `Evidence` (cascade) + đặt `PlanItem.done = false`.
 * Idempotent: slot chưa done ⇒ trả `alreadyDone: false`, không xoá gì.
 *
 * ⚠️ Chỉ xoá `Activity` **mới nhất** của slot — không xoá những hoạt động cũ
 * đã tồn tại trước khi bấm "Xong".
 */
export async function uncompletePlanItem(input: {
  date: Date;
  slot: number;
}): Promise<{
  removedActivityId: string | null;
  removedEvidenceId: string | null;
  planItem: PlanSlotDTO | null;
  wasDone: boolean;
}> {
  const day = normalizeDate(input.date);

  return prisma.$transaction(async (tx) => {
    const planItem = await tx.planItem.findFirst({
      where: { date: day, slot: input.slot },
    });

    if (!planItem) {
      throw new PlanItemNotFoundError(input.slot);
    }

    if (!planItem.done) {
      const skillNames = await loadSkillNames([planItem.skillId]);
      return {
        removedActivityId: null,
        removedEvidenceId: null,
        planItem: toDTO(planItem, skillNames),
        wasDone: false,
      };
    }

    // Activity mới nhất của slot này (được tạo khi bấm "Xong").
    const activity = await tx.activity.findFirst({
      where: {
        skillId: planItem.skillId,
        title: planItem.action,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let removedEvidenceId: string | null = null;
    if (activity) {
      const evidence = await tx.evidence.findFirst({
        where: { activityId: activity.id },
        select: { id: true },
      });
      removedEvidenceId = evidence?.id ?? null;
      // Cascade xoá Evidence khi xoá Activity.
      await tx.activity.delete({ where: { id: activity.id } });
    }

    await tx.planItem.update({
      where: { id: planItem.id },
      data: { done: false },
    });

    const skillNames = await loadSkillNames([planItem.skillId]);
    return {
      removedActivityId: activity?.id ?? null,
      removedEvidenceId,
      planItem: { ...toDTO(planItem, skillNames), done: false },
      wasDone: true,
    };
  });
}

/* ══ Lộ trình 3 giai đoạn (Q4, FR-DL-09) ═════════════════════════════════ */

/**
 * Số Evidence ở domain `professional` — điều kiện đạt của giai đoạn.
 *
 * Đếm **mọi** rating (không chỉ rating ≥ 3) vì đây là "đã tích lũy bao nhiêu
 * bằng chứng", không phải "bậc hiện tại".
 */
export async function countProfessionalEvidence(): Promise<number> {
  return prisma.evidence.count({
    where: { skill: { domain: "professional" } },
  });
}

/** Evidence 7 ngày gần nhất — dùng tính velocity. */
export async function countRecentEvidence(days = 7): Promise<number> {
  const from = addDays(normalizeDate(new Date()), -(days - 1));
  return prisma.evidence.count({ where: { createdAt: { gte: from } } });
}

/** Số ngày có ít nhất 1 Evidence trong 7 ngày gần nhất. */
export async function countDaysWithEvidence(days = 7): Promise<number> {
  const from = addDays(normalizeDate(new Date()), -(days - 1));
  const evidences = await prisma.evidence.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true },
  });

  return new Set(evidences.map((e) => toDateKey(e.createdAt))).size;
}

/** Điểm mock interview cao nhất (null = chưa có phiên nào có điểm). */
export async function getBestInterviewScore(): Promise<number | null> {
  const session = await prisma.interviewSession.findFirst({
    where: { totalScore: { not: null } },
    orderBy: { totalScore: "desc" },
    select: { totalScore: true },
  });

  return session?.totalScore ?? null;
}

/** Số ngày trôi qua kể từ Evidence cuối cùng (null = chưa có Evidence nào). */
export async function getDaysSinceLastEvidence(): Promise<number | null> {
  const last = await prisma.evidence.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!last) return null;

  return Math.max(0, daysBetween(last.createdAt, new Date()));
}

/** StageProgress mở rộng — thêm dữ liệu cho FR-DL-11 (giảm tải). */
export interface StageProgressExtended extends StageProgress {
  /** Số ngày trôi qua kể từ Evidence cuối cùng (null = chưa có). */
  daysSinceLastEvidence: number | null;
  /** Trượt ≥2 ngày → nên giảm tải (FR-DL-11). */
  shouldReduceLoad: boolean;
}

/**
 * Lộ trình hiện tại — dữ liệu đầy đủ cho UI top strip + prompt AI-01.
 */
export async function getStageProgress(): Promise<StageProgressExtended> {
  const [evidenceCount, recentEvidence, daysWithData, interviewScore, daysSinceLast] =
    await Promise.all([
      countProfessionalEvidence(),
      countRecentEvidence(),
      countDaysWithEvidence(),
      getBestInterviewScore(),
      getDaysSinceLastEvidence(),
    ]);

  const progress = resolveCurrentStage(
    evidenceCount,
    interviewScore,
    recentEvidence,
    daysWithData,
  );

  return {
    ...progress,
    daysSinceLastEvidence: daysSinceLast,
    shouldReduceLoad: daysSinceLast !== null && shouldReduceLoad(daysSinceLast),
  };
}

/* ══ Dữ liệu sidebar S02 (task §27) ════════════════════════════════════ */

/**
 * Ràng buộc sinh học hôm nay — mood/energy/sleep/focus.
 */
export async function getBioConstraints(date: Date): Promise<{
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
}> {
  const row = await prisma.dailyState.findUnique({
    where: { date: normalizeDate(date) },
    select: { mood: true, energy: true, sleep: true, focus: true },
  });

  return {
    mood: row?.mood ?? null,
    energy: row?.energy ?? null,
    sleep: row?.sleep ?? null,
    focus: row?.focus ?? null,
  };
}

/**
 * "Trọng Tâm Bứt Phá" — kỹ năng **ít bằng chứng nhất** trong domain
 * chuyên môn (27.2). Đây là nơi AI nên đào sâu, không phải kỹ năng mạnh nhất.
 */
export async function getBreakthroughFocus(): Promise<{
  skillId: string;
  skillName: string;
  domain: Domain;
  evidenceCount: number;
  priority: number;
} | null> {
  // Đếm Evidence bằng `groupBy` — schema `Skill` không có `archived`,
  // và `_count` chỉ dùng được trong `include`, không dùng được với `orderBy`.
  const counts = await prisma.evidence.groupBy({
    by: ["skillId"],
    where: { skill: { domain: "professional" } },
    _count: { _all: true },
  });

  const skills = await prisma.skill.findMany({
    where: { domain: "professional" },
    select: { id: true, name: true, domain: true },
  });

  if (skills.length === 0) return null;

  const countBySkill = new Map(
    counts.map((row) => [row.skillId, row._count._all]),
  );

  // Ít bằng chứng nhất — đây là nơi cần đào sâu.
  const skill = skills.reduce((min, current) => {
    const currentCount = countBySkill.get(current.id) ?? 0;
    const minCount = countBySkill.get(min.id) ?? 0;
    return currentCount < minCount ? current : min;
  });

  const evidenceCount = countBySkill.get(skill.id) ?? 0;

  // Ưu tiên = càng ít bằng chứng càng cao (0–100).
  const priority = Math.max(0, Math.min(100, 100 - evidenceCount * 10));

  return {
    skillId: skill.id,
    skillName: skill.name,
    domain: skill.domain as Domain,
    evidenceCount,
    priority,
  };
}

/**
 * Chi phí phiên sinh gần nhất — đọc từ `AiCall` đã ghi thật (P7: không
 * ước lượng). Trả `null` khi chưa có phiên nào.
 */
export async function getLatestGenerationCost(): Promise<{
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  usd: number;
  model: string;
  createdAt: string;
} | null> {
  // `AiCall.feature` = "daily_plan" (xem schema.prisma).
  const call = await prisma.aiCall.findFirst({
    where: { feature: "daily_plan" },
    orderBy: { createdAt: "desc" },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      cacheWrite: true,
      estimatedCost: true,
      createdAt: true,
    },
  });

  if (!call) return null;

  return {
    cachedInputTokens: call.cacheRead,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    // Schema không lưu latency ⇒ dùng 0 (không bịa số liệu — P7).
    latencyMs: 0,
    usd: call.estimatedCost,
    model: call.model,
    createdAt: call.createdAt.toISOString(),
  };
}

/**
 * Lỗi AI gần nhất (AC-DL-6) — để S01 hiện banner "AI lỗi, đang dùng kế hoạch
 * offline" kèm nút "Thử lại".
 *
 * ⚠️ Chỉ coi là lỗi khi `ok = false` ⇒ không báo nhầm cho phiên thành công.
 */
export async function getLatestAiFailure(): Promise<{
  message: string;
  createdAt: string;
} | null> {
  const call = await prisma.aiCall.findFirst({
    where: { ok: false },
    orderBy: { createdAt: "desc" },
    select: { error: true, createdAt: true },
  });

  if (!call) return null;

  return {
    message: call.error ?? "Không sinh được kế hoạch.",
    createdAt: call.createdAt.toISOString(),
  };
}
