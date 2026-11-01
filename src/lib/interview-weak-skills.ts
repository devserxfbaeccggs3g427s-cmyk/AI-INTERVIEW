/**
 * Thuật toán chọn kỹ năng yếu (FR-MI-02, AC-10).
 *
 * ⚠️ Tách khỏi Prisma (design.md §2.3 rule 9) — hàm nhận mảng dữ liệu thuần
 * ⇒ test được bằng fixture, không cần DB.
 *
 * Nguồn: `.kiro/specs/mock-interview/spec.md` §5.7 · `design.md` §3.2.
 */

import { prisma } from "@/lib/db";

/** Thống kê bằng chứng của 1 node kỹ năng. */
export interface SkillEvidenceStat {
  readonly skillId: string;
  readonly name: string;
  /** 0..5 — level hiện tại của node. */
  readonly level: number;
  /** Tổng số `Evidence` gắn với node. */
  readonly evidenceCount: number;
  /** `null` khi `evidenceCount === 0`. */
  readonly avgRating: number | null;
  /** Đường dẫn hiển thị, vd "Chuyên môn / System Design / Phân tích yêu cầu". */
  readonly path: string;
}

/** Mức ưu tiên hiển thị trên S16. */
export type WeaknessBand = "P0" | "P1" | "P2";

export interface WeakSkillView extends SkillEvidenceStat {
  readonly band: WeaknessBand;
  /** `evidenceCount*2 + (5 - level)` — số hiển thị "Score: 0.0". */
  readonly score: number;
}

export interface WeakSkillsOptions {
  /** Số node ghim mặc định = 2. */
  readonly pinCount?: number;
  /** Giữ thuộc tính của `stats` (mặc định true). */
  readonly includeAncestors?: boolean;
}

/**
 * Sắp xếp tăng dần theo **4 khoá** (spec §5.7):
 *   1. `evidenceCount` ASC — ưu tiên mục ít bằng chứng nhất (AC-10).
 *   2. `avgRating` ASC — bằng chứng có nhưng yếu. `null` ⇒ `Infinity`
 *      (không bị ưu tiên sai).
 *   3. `level` ASC — node level thấp.
 *   4. `name` ASC — khoá ổn định (R9: cùng dữ liệu ⇒ cùng kết quả).
 */
export function rankWeakSkills(
  stats: readonly SkillEvidenceStat[],
  options: WeakSkillsOptions = {},
): WeakSkillView[] {
  const pinCount = options.pinCount ?? 2;

  const ranked = [...stats].sort((a, b) => {
    if (a.evidenceCount !== b.evidenceCount) return a.evidenceCount - b.evidenceCount;

    const aRating = a.avgRating ?? Number.POSITIVE_INFINITY;
    const bRating = b.avgRating ?? Number.POSITIVE_INFINITY;
    if (aRating !== bRating) return aRating - bRating;

    if (a.level !== b.level) return a.level - b.level;

    return a.name.localeCompare(b.name);
  });

  return ranked.slice(0, Math.max(0, pinCount)).map((stat) => ({
    ...stat,
    band: bandOf(stat.evidenceCount, stat.level),
    score: stat.evidenceCount * 2 + (5 - stat.level),
  }));
}

/** Lấy đúng N node đầu sau khi rank. */
export function pickWeakSkills(
  stats: readonly SkillEvidenceStat[],
  count: number,
): WeakSkillView[] {
  return rankWeakSkills(stats, { pinCount: count });
}

/**
 * Phân loại mức ưu tiên:
 * - `P0` — 0 bằng chứng (cần kiểm thử).
 * - `P1` — 1–2 bằng chứng (khảo sát lại).
 * - `P2` — ≥3 bằng chứng (đã có nền tảng).
 */
export function bandOf(evidenceCount: number, level: number): WeaknessBand {
  if (evidenceCount === 0) return "P0";
  if (evidenceCount <= 2) return "P1";
  // `level` không đổi band nhưng được giữ trong chữ ký để UI tương lai dùng.
  void level;
  return "P2";
}

/* ══ Truy vấn DB ═════════════════════════════════════════════════════════════ */

/**
 * Thống kê bằng chứng cho danh sách skillId — chỉ node domain `professional`.
 *
 * SQL (design.md §3.2):
 * ```sql
 * SELECT s.id, s.name, s.level, COUNT(e.id), AVG(e.rating)
 * FROM Skill s LEFT JOIN Evidence e ON e.skillId = s.id
 * WHERE s.id IN (...) AND s.domain = 'professional'
 * GROUP BY s.id, s.name, s.level
 * ```
 */
export async function getSkillEvidenceStats(
  skillIds: readonly string[],
): Promise<SkillEvidenceStat[]> {
  if (skillIds.length === 0) return [];

  const skills = await prisma.skill.findMany({
    where: { id: { in: [...skillIds] }, domain: "professional" },
    select: {
      id: true,
      name: true,
      level: true,
      parent: { select: { name: true, parent: { select: { name: true } } } },
      evidences: { select: { rating: true } },
    },
  });

  return skills.map((skill) => {
    const count = skill.evidences.length;
    const ratingSum = skill.evidences.reduce((acc, item) => acc + item.rating, 0);

    const pathParts = [
      skill.parent?.parent?.name,
      skill.parent?.name,
      skill.name,
    ].filter((part): part is string => Boolean(part));

    return {
      skillId: skill.id,
      name: skill.name,
      level: skill.level,
      evidenceCount: count,
      avgRating: count > 0 ? Math.round((ratingSum / count) * 100) / 100 : null,
      path: pathParts.join(" / "),
    };
  });
}

/**
 * Node `professional` yếu nhất trong **toàn cây** — fallback khi hồ sơ không
 * ghim node nào (spec §6.6 edge case "focusSkills rỗng").
 */
export async function getWeakestProfessionalSkills(
  count: number,
): Promise<WeakSkillView[]> {
  const skills = await prisma.skill.findMany({
    where: { domain: "professional" },
    select: {
      id: true,
      name: true,
      level: true,
      parent: { select: { name: true, parent: { select: { name: true } } } },
      evidences: { select: { rating: true } },
    },
  });

  const stats: SkillEvidenceStat[] = skills.map((skill) => {
    const count2 = skill.evidences.length;
    const ratingSum = skill.evidences.reduce((acc, item) => acc + item.rating, 0);

    const pathParts = [
      skill.parent?.parent?.name,
      skill.parent?.name,
      skill.name,
    ].filter((part): part is string => Boolean(part));

    return {
      skillId: skill.id,
      name: skill.name,
      level: skill.level,
      evidenceCount: count2,
      avgRating: count2 > 0 ? Math.round((ratingSum / count2) * 100) / 100 : null,
      path: pathParts.join(" / "),
    };
  });

  return rankWeakSkills(stats, { pinCount: count });
}

/**
 * Đếm bằng chứng của **mọi** node `professional` — dùng cho gợi ý phiên
 * (FR-MI-16) và bảng điều khiển S16.
 */
export async function getAllProfessionalSkillStats(): Promise<SkillEvidenceStat[]> {
  const skills = await prisma.skill.findMany({
    where: { domain: "professional" },
    select: {
      id: true,
      name: true,
      level: true,
      parent: { select: { name: true, parent: { select: { name: true } } } },
      evidences: { select: { rating: true } },
    },
  });

  return skills.map((skill) => {
    const count = skill.evidences.length;
    const ratingSum = skill.evidences.reduce((acc, item) => acc + item.rating, 0);

    const pathParts = [
      skill.parent?.parent?.name,
      skill.parent?.name,
      skill.name,
    ].filter((part): part is string => Boolean(part));

    return {
      skillId: skill.id,
      name: skill.name,
      level: skill.level,
      evidenceCount: count,
      avgRating: count > 0 ? Math.round((ratingSum / count) * 100) / 100 : null,
      path: pathParts.join(" / "),
    };
  });
}
