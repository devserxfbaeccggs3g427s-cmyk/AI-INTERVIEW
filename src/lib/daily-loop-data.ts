/**
 * Data layer cho S01 — Daily Loop (`/`).
 *
 * Gộp mọi truy vấn Prisma của S01 vào 1 chỗ để `src/app/page.tsx` gọn và dễ
 * kiểm thử. Hàm này chạy **server-side** (không đụng "use client").
 *
 * Vì sao tách riêng `src/lib/plan-helpers.ts` (file của agent khác): file đó
 * lo phần **sinh & ghi** kế hoạch, còn file này lo phần **đọc & dựng DTO**
 * cho màn hình.
 *
 * Xem tasks.md 4.1 / 4.9 / 4.10 · design.md §4.1.
 */

import { prisma } from "@/lib/db";
import { addDays, dateKey, lastNWeekdays, startOfDay, weekdayShort } from "@/lib/dates";
import { readEnvLocalKeyCached } from "@/lib/settings-api-key";
import { retrievabilityPercent, retentionCurve, type Card as FsrsCard } from "@/lib/fsrs";
import { getFocusSkill } from "@/lib/focus";
import { generateLocalPlan, SLOT_TEMPLATE } from "@/lib/plan";
import { applyPlanSlots, buildLocalPlanContext } from "@/lib/plan-helpers";
import { computeStreak, computeWeekEnergy } from "@/lib/shell";
import { type Domain, type PlanSlot } from "@/lib/types";
import type {
  BioRhythmDTO,
  CacheStatsDTO,
  DailySlotDTO,
  FocusDTO,
  FsrsStatsDTO,
  WeekDayDTO,
} from "@/lib/daily-loop-types";

/** Đọc `cardState` JSON của `Card` — trả về `null` nếu state hỏng/không khớp. */
function readFsrsState(raw: unknown): FsrsCard | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<FsrsCard>;
  if (typeof s.state !== "number" || typeof s.stability !== "number") return null;
  return {
    due: s.due instanceof Date ? s.due : new Date(String(s.due ?? Date.now())),
    stability: s.stability,
    difficulty: s.difficulty ?? 0,
    elapsed_days: s.elapsed_days ?? 0,
    scheduled_days: s.scheduled_days ?? 0,
    reps: s.reps ?? 0,
    lapses: s.lapses ?? 0,
    state: s.state,
    ...(s.last_review ? { last_review: new Date(s.last_review) } : {}),
  } as FsrsCard;
}

/**
 * Đọc 6 slot kế hoạch hôm nay — **tự sinh + ghi vào DB nếu chưa có**.
 *
 * FR-DL-07 / AC-7: khi chưa có kế hoạch VÀ không có `ANTHROPIC_API_KEY`, app
 * vẫn phải hiện đủ 6 slot bằng rule cục bộ (`generateLocalPlan`) — và phải
 * **ghi xuống DB** để lần render sau (và `SlotCard`) đồng bộ, không phải sinh
 * lại mỗi lần.
 *
 * Ghi chú về `PlanItem`: schema KHÔNG có unique index `(date, slot)`, nên ta
 * dùng `applyPlanSlots` (đọc → update slot cũ → create slot mới → xoá slot
 * thừa) thay vì `upsert` — tránh lỗi "record not found" của `upsert` với
 * khoá không unique.
 */
export async function loadTodayPlan(now: Date = new Date()): Promise<{
  slots: PlanSlot[];
  /** true = vừa phải sinh fallback vì hôm nay chưa có kế hoạch. */
  generated: boolean;
}> {
  const day = startOfDay(now);

  const existing = await prisma.planItem.findMany({
    where: { date: day },
    orderBy: { slot: "asc" },
  });

  if (existing.length > 0) {
    const bySlot = new Map(existing.map((p) => [p.slot, p]));
    const slots: PlanSlot[] = SLOT_TEMPLATE.map((t) => {
      const got = bySlot.get(t.slot);
      return {
        slot: t.slot,
        domain: (got?.domain as Domain) ?? t.domain,
        action: got?.action ?? t.content,
        detail: got?.detail ?? null,
        minutes: got?.minutes ?? Math.round((t.minMinutes + t.maxMinutes) / 2),
        skillId: got?.skillId ?? null,
        done: got?.done ?? false,
        source: (got?.source as PlanSlot["source"]) ?? "ai",
      };
    });
    return { slots, generated: false };
  }

  // Chưa có kế hoạch hôm nay → sinh bằng rule cục bộ rồi GHI xuống DB.
  // `buildLocalPlanContext` đọc skills/dueCards/streak từ DB để rule có ngữ cảnh.
  const ctx = await buildLocalPlanContext(now);
  const slots = generateLocalPlan(ctx);
  await applyPlanSlots(slots, { date: day, source: "fallback" });

  return { slots, generated: true };
}

/**
 * Dựng DTO cho 6 `SlotCard`.
 *
 * - `planItemId` cần để `POST /api/log` đánh dấu `PlanItem.done`.
 * - Slot ưu tiên = slot 0, hoặc slot đầu tiên **chưa xong** (design.md §4.1:
 *   "Slot đang là ưu tiên có rail màu bên trái + badge CTA khác").
 */
export async function loadSlots(now: Date = new Date()): Promise<DailySlotDTO[]> {
  const { slots } = await loadTodayPlan(now);

  const planItems = await prisma.planItem.findMany({
    where: { date: startOfDay(now) },
    select: { id: true, slot: true, skillId: true },
  });
  const idBySlot = new Map(planItems.map((p) => [p.slot, p.id]));

  // Tên skill để hiển thị "kỹ năng liên quan" (FR-DL-02).
  const skillIds = Array.from(
    new Set(slots.map((s) => s.skillId).filter((v): v is string => Boolean(v))),
  );
  const skills = skillIds.length
    ? await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(skills.map((s) => [s.id, s.name]));

  const firstUndone = slots.find((s) => !s.done)?.slot ?? 0;

  return slots.map((s) => ({
    planItemId: idBySlot.get(s.slot) ?? null,
    slot: s.slot,
    domain: s.domain,
    action: s.action,
    detail: s.detail,
    minutes: s.minutes,
    skillId: s.skillId,
    skillName: s.skillId ? (nameById.get(s.skillId) ?? null) : null,
    done: s.done,
    isPriority: s.slot === firstUndone,
  }));
}

/** Dữ liệu `FocusNodeCard` (task 4.2). */
export async function loadFocus(now: Date = new Date()): Promise<FocusDTO | null> {
  const [focus, aiCall] = await Promise.all([
    getFocusSkill(now),
    prisma.aiCall.findFirst({ orderBy: { createdAt: "desc" }, select: { provider: true, model: true } }),
  ]);

  if (!focus) return null;

  // Nhãn provider đọc từ `AiCall` thật (FR-AI-11) — không hardcode.
  let aiChip = "AI Offline / Local (Ollama)";
  let aiIsLocal = true;
  if (aiCall) {
    if (aiCall.provider === "local") {
      aiChip = "AI Offline / Local (Ollama)";
      aiIsLocal = true;
    } else if (aiCall.model.startsWith("claude-haiku")) {
      aiChip = "AI Online / Cloud (Claude Haiku 4.5)";
      aiIsLocal = false;
    } else {
      aiChip = "AI Online / Cloud (Claude Opus 5)";
      aiIsLocal = false;
    }
  } else if (readEnvLocalKeyCached() ?? process.env.ANTHROPIC_API_KEY) {
    aiChip = "AI Online / Cloud (Claude Opus 5)";
    aiIsLocal = false;
  }

  return {
    skillId: focus.skillId,
    name: focus.name ?? "Chưa có kỹ năng",
    level: focus.level,
    targetLevel: focus.targetLevel,
    evidenceCount: focus.evidenceCount,
    accumulatedMinutes: focus.accumulatedMinutes,
    isManual: focus.isManual,
    aiChip,
    aiIsLocal,
  };
}

/**
 * Dữ liệu `WeekStreak` (task 4.3) — 7 cột T2→CN của tuần hiện tại.
 *
 * Trạng thái mỗi ngày:
 *   - `done`   — có ít nhất 1 slot `done`.
 *   - `missed` — đã qua nhưng chưa slot nào `done`.
 *   - `today`  — là hôm nay (kể cả đã có slot xong → vẫn hiện viền "hôm nay").
 *   - `future` — chưa tới.
 */
export async function loadWeek(now: Date = new Date()): Promise<{
  days: WeekDayDTO[];
  streak: number;
}> {
  const days = lastNWeekdays(now, 7);
  const from = days[0] ?? startOfDay(now);
  const to = addDays(from, 7);

  const items = await prisma.planItem.findMany({
    where: { date: { gte: from, lt: to } },
    select: { date: true, done: true },
  });

  const perDay = new Map<string, { done: number; total: number }>();
  for (const item of items) {
    const key = dateKey(item.date);
    const cur = perDay.get(key) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (item.done) cur.done += 1;
    perDay.set(key, cur);
  }

  const todayKeyStr = dateKey(now);
  const nowMs = now.getTime();

  const out: WeekDayDTO[] = days.map((d) => {
    const key = dateKey(d);
    const stat = perDay.get(key) ?? { done: 0, total: 0 };
    const state: WeekDayDTO["state"] =
      key === todayKeyStr ? "today" : d.getTime() > nowMs ? "future" : stat.done > 0 ? "done" : "missed";
    return {
      dateKey: key,
      label: weekdayShort(d),
      day: d.getDate(),
      state,
      doneCount: stat.done,
      totalCount: stat.total,
    };
  });

  return { days: out, streak: await computeStreak(now) };
}

/**
 * Thống kê FSRS cho `FsrsRetrievabilityCard` (task 4.7).
 *
 * Retention / stability / difficulty chỉ tính trên **thẻ đã học** (state ≠ New
 * và `stability > 0`). Nếu mọi thẻ đều chưa học → `retention = null` để UI
 * hiện "—" thay vì 0% (tránh phản ánh sai).
 */
export async function loadFsrsStats(now: Date = new Date()): Promise<FsrsStatsDTO> {
  const cards = await prisma.card.findMany({
    select: { cardState: true, stability: true, difficulty: true },
    take: 500,
  });

  const states: FsrsCard[] = [];
  for (const c of cards) {
    const s = readFsrsState(c.cardState);
    if (s) states.push(s);
  }

  const learning = states.filter((s) => s.state !== 0 && s.stability > 0);

  if (learning.length === 0) {
    return {
      retention: null,
      avgStability: null,
      avgDifficulty: null,
      curve: [],
      learningCount: 0,
      totalCount: cards.length,
    };
  }

  const retention =
    learning.reduce((acc, s) => acc + retrievabilityPercent(s, now), 0) / learning.length;
  const avgStability = learning.reduce((acc, s) => acc + s.stability, 0) / learning.length;
  const avgDifficulty = learning.reduce((acc, s) => acc + s.difficulty, 0) / learning.length;

  // Đường cong 7 ngày: trung bình `retentionCurve` của các thẻ đã học.
  const curves = learning.map((s) => retentionCurve(s, now, 7));
  const curve = Array.from({ length: 7 }, (_, i) => {
    const sum = curves.reduce((acc, c) => acc + (c[i] ?? 0), 0);
    return Math.round((sum / curves.length) * 1000) / 1000;
  });

  return {
    retention: Math.round(retention * 10) / 10,
    avgStability: Math.round(avgStability * 100) / 100,
    avgDifficulty: Math.round(avgDifficulty * 100) / 100,
    curve,
    learningCount: learning.length,
    totalCount: cards.length,
  };
}

/**
 * Thống kê prompt cache cho `CacheHitCard` (task 4.8).
 *
 * Công thức BẮT BUỘC (design.md §4.1): `sum(cacheRead) / sum(inputTokens + cacheRead)`.
 * Mẫu số = 0 → trả 0 (không chia cho 0).
 */
export async function loadCacheStats(): Promise<CacheStatsDTO> {
  const agg = await prisma.aiCall.aggregate({
    _sum: { cacheRead: true, inputTokens: true },
    _count: { _all: true },
  });

  const cacheReadTokens = agg._sum.cacheRead ?? 0;
  const inputTokens = agg._sum.inputTokens ?? 0;
  const denominator = inputTokens + cacheReadTokens;
  const hitRate = denominator === 0 ? 0 : Math.round((cacheReadTokens / denominator) * 1000) / 10;

  return {
    hitRate,
    cacheReadTokens,
    inputTokens,
    totalCalls: agg._count._all,
  };
}

/** Dữ liệu `BioRhythmPanel` (task 4.9) — chỉ đọc, S12 mới cho sửa. */
export async function loadBioRhythm(now: Date = new Date()): Promise<BioRhythmDTO> {
  const day = startOfDay(now);

  const [state, dueCards, weekEnergy, streak] = await Promise.all([
    prisma.dailyState.findUnique({ where: { date: day } }),
    prisma.card.count({ where: { due: { lte: now } } }),
    computeWeekEnergy(now),
    computeStreak(now),
  ]);

  return {
    mood: state?.mood ?? null,
    energy: state?.energy ?? null,
    focus: state?.focus ?? null,
    sleep: state?.sleep ?? null,
    dueCards,
    weekEnergy,
    streak,
  };
}

/** Tổng hợp mọi dữ liệu S01 trong 1 lần gọi — dùng bởi `src/app/page.tsx`. */
export async function loadDailyLoopData(now: Date = new Date()): Promise<{
  slots: DailySlotDTO[];
  focus: FocusDTO | null;
  week: { days: WeekDayDTO[]; streak: number };
  fsrs: FsrsStatsDTO;
  cache: CacheStatsDTO;
  bio: BioRhythmDTO;
}> {
  const [slots, focus, week, fsrs, cache, bio] = await Promise.all([
    loadSlots(now),
    loadFocus(now),
    loadWeek(now),
    loadFsrsStats(now),
    loadCacheStats(),
    loadBioRhythm(now),
  ]);

  return { slots, focus, week, fsrs, cache, bio };
}
