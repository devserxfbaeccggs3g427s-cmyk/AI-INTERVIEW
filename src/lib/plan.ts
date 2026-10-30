/**
 * Bộ sinh kế hoạch cục bộ — fallback khi không có AI.
 *
 * FR-AI-06 / FR-DL-07: không có `ANTHROPIC_API_KEY` → app vẫn sinh được 6 slot
 * bằng rule cục bộ. AI cũng phải tuân thủ CÙNG cấu trúc slot này.
 *
 * Xem tasks.md 4.1 / 4.10 · design.md §6.10.
 */

import { SLOT_COUNT, type Domain, type PlanSlot } from "@/lib/types";

/**
 * Cấu trúc 6 slot cố định (SPEC.md §2.1).
 * AI chỉ được điền nội dung — KHÔNG được đổi domain hay số lượng slot.
 */
export const SLOT_TEMPLATE: ReadonlyArray<{
  slot: number;
  domain: Domain;
  content: string;
  minMinutes: number;
  maxMinutes: number;
}> = [
  { slot: 0, domain: "professional", content: "Học kỹ năng chuyên môn", minMinutes: 25, maxMinutes: 45 },
  { slot: 1, domain: "communication", content: "Luyện giao tiếp", minMinutes: 15, maxMinutes: 30 },
  { slot: 2, domain: "language", content: "Ôn ngoại ngữ (SRS)", minMinutes: 10, maxMinutes: 20 },
  { slot: 3, domain: "language", content: "Luyện ngoại ngữ chủ động (viết/hội thoại)", minMinutes: 15, maxMinutes: 25 },
  { slot: 4, domain: "personal", content: "Nhật ký / suy nghĩ", minMinutes: 5, maxMinutes: 10 },
  { slot: 5, domain: "personal", content: "Chăm sóc thể chất & tinh thần", minMinutes: 15, maxMinutes: 30 },
];

export type LocalPlanContext = {
  date: Date;
  /** Danh sách skill — dùng để chọn kỹ năng yếu nhất cho slot 0. */
  skills: Array<{ id: string; name: string; level: number; targetLevel: number; domain: string }>;
  /** Số thẻ đến hạn hôm nay. */
  dueCards: number;
  /** Streak hiện tại (ngày liên tiếp). */
  streak: number;
  /** Tỷ lệ hoàn thành tuần trước 0..1. */
  lastWeekCompletion: number;
  /** Có nên giảm tải không (AI weekly review tự giảm tải khi trượt >= 2 ngày). */
  reduceLoad?: boolean;
};

/** Sinh 6 slot bằng rule cục bộ. */
export function generateLocalPlan(ctx: LocalPlanContext): PlanSlot[] {
  const weakest = pickWeakestSkill(ctx.skills);

  const minutesFor = (slot: number): number => {
    const t = SLOT_TEMPLATE[slot];
    if (!t) return 15;
    const mid = Math.round((t.minMinutes + t.maxMinutes) / 2);
    // Giảm tải khi người dùng trượt nhiều ngày liên tiếp.
    if (ctx.reduceLoad) return Math.max(5, Math.round(mid * 0.6));
    return mid;
  };

  const detailFor = (slot: number): string | null => {
    switch (slot) {
      case 0:
        return weakest
          ? `Ưu tiên kỹ năng yếu nhất: ${weakest.name} (level ${weakest.level}/${weakest.targetLevel}).`
          : null;
      case 1:
        return "Viết 1 đoạn theo đề bài gợi ý, sau đó đọc lại và tự chấm 5 tiêu chí.";
      case 2: {
        const n = Math.min(ctx.dueCards, 20);
        return n > 0 ? `Ôn ${n} thẻ đến hạn.` : "Chưa có thẻ đến hạn — ôn chủ động 5 thẻ ngẫu nhiên.";
      }
      case 3:
        return "Luyện viết 5 câu theo chủ đề ngẫu nhiên, sau đó đối chiếu bản chuẩn.";
      case 4:
        return "Viết nhật ký 5 phút: hôm nay học được gì? Điều gì làm mình khựng lại?";
      case 5:
        return "Đi bộ / tập thể dục / nghe nhạc thư giãn — nghỉ ngơi cũng là tiến bộ.";
      default:
        return null;
    }
  };

  const skillFor = (slot: number): string | null => {
    if (slot === 0) return weakest?.id ?? null;
    if (slot === 1) {
      const comm = ctx.skills.find((s) => s.domain === "communication");
      return comm?.id ?? null;
    }
    if (slot === 2 || slot === 3) {
      const lang = ctx.skills.find((s) => s.domain === "language");
      return lang?.id ?? null;
    }
    return null;
  };

  const actionFor = (slot: number): string => {
    const t = SLOT_TEMPLATE[slot];
    if (!t) return "Hoàn thành một hành động nhỏ";
    if (slot === 0 && weakest) {
      return `Học: ${weakest.name}`;
    }
    return t.content;
  };

  return SLOT_TEMPLATE.map((t) => ({
    slot: t.slot,
    domain: t.domain,
    action: actionFor(t.slot),
    detail: detailFor(t.slot),
    minutes: minutesFor(t.slot),
    skillId: skillFor(t.slot),
    done: false,
    source: "fallback" as const,
  }));
}

/** Chọn kỹ năng yếu nhất: thiếu bằng chứng nhất so với target. */
export function pickWeakestSkill<T extends { level: number; targetLevel: number }>(
  skills: T[],
): T | undefined {
  if (skills.length === 0) return undefined;
  return [...skills].sort((a, b) => {
    const gapA = a.targetLevel - a.level;
    const gapB = b.targetLevel - b.level;
    if (gapA !== gapB) return gapB - gapA;
    return a.level - b.level;
  })[0];
}

/** Chuẩn hoá 6 slot từ AI về đúng cấu trúc — bỏ qua slot thừa, điền slot thiếu. */
export function normalizePlanSlots(
  raw: Array<Partial<PlanSlot> & { action?: string }>,
): PlanSlot[] {
  const bySlot = new Map<number, Partial<PlanSlot>>();
  for (const item of raw) {
    if (typeof item.slot !== "number") continue;
    if (item.slot < 0 || item.slot >= SLOT_COUNT) continue;
    bySlot.set(item.slot, item);
  }

  return SLOT_TEMPLATE.map((t) => {
    const got = bySlot.get(t.slot);
    const minutes = got?.minutes;
    const clampedMinutes =
      typeof minutes === "number" && minutes > 0
        ? Math.min(60, Math.round(minutes))
        : Math.round((t.minMinutes + t.maxMinutes) / 2);

    return {
      slot: t.slot,
      domain: t.domain,
      action: (got?.action ?? "").trim() || t.content,
      detail: got?.detail?.trim() || null,
      minutes: clampedMinutes,
      skillId: got?.skillId ?? null,
      done: false,
      source: (got?.source ?? "ai") as PlanSlot["source"],
    };
  });
}
