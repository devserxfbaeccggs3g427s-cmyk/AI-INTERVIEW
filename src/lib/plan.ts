/**
 * Bộ sinh kế hoạch offline (rule cục bộ) — dùng khi không có API key.
 *
 * ⚠️ P6 — local-first: đây là đường lùi **thật**, không phải giả lập AI.
 * Mọi item sinh ra đều có `source = "fallback"` ⇒ UI **không** gắn nhãn "AI".
 *
 * Deterministic: cùng đầu vào + cùng ngày ⇒ kết quả giống hệt (không random).
 */

import {
  EVIDENCE_RATING_MIN,
  SLOT_CONTRACTS,
  SLOT_COUNT,
  SLOT_DOMAINS,
  type SlotKind,
} from "@/lib/config";
import { prisma } from "@/lib/db";
import type { Domain } from "@/lib/prompts";

export interface SkillForPlan {
  id: string;
  name: string;
  domain: Domain;
  /** level hiện tại 0..5 — càng thấp càng ưu tiên. */
  level: number;
  /** số bằng chứng rating >= 3 — càng ít càng ưu tiên. */
  evidenceCount: number;
}

export interface FallbackPlanItem {
  slot: number;
  domain: Domain;
  kind: SlotKind;
  action: string;
  detail: string;
  minutes: number;
  skillId: string | null;
  skillName: string | null;
  source: "fallback";
}

/** Thời lượng mặc định theo slot — nằm giữa khoảng của slot. */
const SLOT_MINUTES: Record<number, number> = { 0: 30, 1: 20, 2: 15, 3: 20, 4: 10, 5: 20 };

/** Action mặc định theo domain — dùng khi không có kỹ năng nào khớp. */
const DEFAULT_ACTION: Record<Domain, { action: string; detail: string }> = {
  professional: {
    action: "Học kỹ năng chuyên môn",
    detail: "Chọn một chủ đề trong cây kỹ năng và học sâu 30 phút",
  },
  communication: {
    action: "Luyện giao tiếp",
    detail: "Viết hoặc nói một đoạn ngắn về chủ đề tuần này",
  },
  language: {
    action: "Ôn ngoại ngữ",
    detail: "Ôn các thẻ đến hạn bằng SRS",
  },
  personal: {
    action: "Nhật ký ngắn",
    detail: "Viết 3 dòng về điều đáng chú ý hôm nay",
  },
};

/**
 * Offset xoay vòng theo ngày — deterministic, không random.
 * Mỗi ngày khác nhau vẫn ưu tiên kỹ năng mức thấp nhất (R-A7).
 */
export function dayOffset(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(utc / 86_400_000);
}

/**
 * Sắp xếp kỹ năng theo ưu tiên: level thấp nhất → ít bằng chứng nhất.
 * Không mutate input.
 */
export function prioritizeSkills(skills: readonly SkillForPlan[]): SkillForPlan[] {
  return [...skills].sort(
    (a, b) =>
      a.level - b.level ||
      a.evidenceCount - b.evidenceCount ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Nạp cây kỹ năng + số bằng chứng (rating >= 3) làm đầu vào cho fallback plan.
 * Chỉ dùng ở chế độ offline — không gọi AI.
 */
export async function listSkillsForPlan(): Promise<SkillForPlan[]> {
  const skills = await prisma.skill.findMany({
    select: {
      id: true,
      name: true,
      domain: true,
      level: true,
      evidences: { where: { rating: { gte: EVIDENCE_RATING_MIN } }, select: { id: true } },
    },
  });

  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain as Domain,
    level: s.level,
    evidenceCount: s.evidences.length,
  }));
}

/**
 * Sinh kế hoạch offline 6 slot.
 *
 * @param skills danh sách kỹ năng của cây (đã lọc domain hợp lệ)
 * @param opts.date ngày cần lập kế hoạch (mặc định hôm nay)
 */
export function generateFallbackPlan(
  skills: readonly SkillForPlan[],
  opts: { date?: Date } = {},
): FallbackPlanItem[] {
  const date = opts.date ?? new Date();
  const offset = dayOffset(date);
  const pool = prioritizeSkills(skills);

  // Nhóm kỹ năng theo domain, mỗi nhóm đã sắp xếp ưu tiên.
  const byDomain = new Map<Domain, SkillForPlan[]>();
  for (const skill of pool) {
    const list = byDomain.get(skill.domain) ?? [];
    list.push(skill);
    byDomain.set(skill.domain, list);
  }

  // Chia kỹ năng theo domain thành các nhóm theo level (thấp → cao).
  // Mỗi slot lấy từ nhóm level THẤP NHẤT còn skill chưa dùng;
  // trong nhóm đó xoay vòng theo ngày để mỗi ngày không lặp lại y hệt.
  const levelGroups = new Map<Domain, SkillForPlan[][]>();
  for (const [domain, pool] of byDomain) {
    const groups: SkillForPlan[][] = [];
    for (const skill of pool) {
      const group = groups.find((g) => g[0].level === skill.level);
      if (group) group.push(skill);
      else groups.push([skill]);
    }
    levelGroups.set(domain, groups);
  }

  const usedIds = new Set<string>();
  const cursorByDomain = new Map<Domain, number>();
  const items: FallbackPlanItem[] = [];

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const domain = SLOT_DOMAINS[slot];
    const groups = levelGroups.get(domain) ?? [];

    let skill: SkillForPlan | null = null;
    for (const group of groups) {
      const available = group.filter((candidate) => !usedIds.has(candidate.id));
      if (available.length === 0) continue;

      const cursor = cursorByDomain.get(domain) ?? 0;
      skill = available[(offset + cursor) % available.length];
      cursorByDomain.set(domain, cursor + 1);
      break; // luôn lấy từ nhóm level thấp nhất còn skill
    }

    if (skill) usedIds.add(skill.id);

    const fallback = DEFAULT_ACTION[domain];
    const kind = SLOT_CONTRACTS[slot].kind;

    items.push({
      slot,
      domain,
      kind,
      // Tiêu đề = tên kỹ năng (nếu có) — FR-DL-SLOT-05.
      action: skill ? skill.name : fallback.action,
      detail: skill
        ? `Luyện "${skill.name}" — mức hiện tại ${skill.level}/5, ${skill.evidenceCount} bằng chứng`
        : fallback.detail,
      minutes: SLOT_MINUTES[slot],
      skillId: skill?.id ?? null,
      skillName: skill?.name ?? null,
      source: "fallback",
    });
  }

  return items;
}
