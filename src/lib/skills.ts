import { prisma } from "@/lib/db";
import {
  EVIDENCE_RATING_MIN,
  EVIDENCE_THRESHOLD,
  SKILL_LEVEL_MAX,
} from "@/lib/config";

/**
 * Lớp nghiệp vụ cây kỹ năng — **nguồn sự thật duy nhất** cho việc ghi bằng
 * chứng và tính level (FR-SK-03, FR-SK-05..FR-SK-15).
 *
 * ⚠️ P3 — tiến độ là **bằng chứng**:
 *  1. `level` KHÔNG tự tăng từ checkbox. Chỉ tăng khi tích lũy đủ `Evidence`
 *     có `rating ≥ EVIDENCE_RATING_MIN` (mặc định 3).
 *  2. Công thức: `level = min(SKILL_LEVEL_MAX, ⌊số BC đạt chuẩn / EVIDENCE_THRESHOLD⌋)`.
 *  3. Node tầng 1 (domain) lấy **MAX** level của toàn bộ hậu duệ.
 *
 * Mọi đường ghi Evidence (kể cả từ `daily-loop-core`) phải đi qua
 * `recordEvidence()` để không có đường nào né quy tắc.
 */

/* ══ Kiểu dữ liệu ═══════════════════════════════════════════════════════ */

export interface SkillNodeDTO {
  id: string;
  name: string;
  nameZh: string | null;
  domain: string;
  parentId: string | null;
  level: number;
  targetLevel: number;
  position: number;
  /** Tổng số bằng chứng (mọi rating). */
  evidenceCount: number;
  /** Số bằng chứng đạt chuẩn (rating ≥ EVIDENCE_RATING_MIN). */
  strongEvidenceCount: number;
  /** Điểm trung bình rating (null khi chưa có bằng chứng). */
  averageRating: number | null;
  /** Tổng phút đã bỏ ra cho hoạt động có bằng chứng. */
  minutesInvested: number;
  /** Level tính lại từ bằng chứng (có thể khác `level` lưu trong DB). */
  computedLevel: number;
  children: SkillNodeDTO[];
}

export interface SkillTreeDTO {
  /** Các node gốc (domain). */
  domains: SkillNodeDTO[];
  /** Tổng số bằng chứng toàn hệ thống. */
  totalEvidence: number;
  /** Bằng chứng đạt chuẩn toàn hệ thống. */
  totalStrongEvidence: number;
  /** Số domain (node gốc). */
  domainCount: number;
  /** Số node lá (mục kỹ năng con) — tầng 3. */
  leafCount: number;
  /** Skill được đặt là trọng tâm hôm nay. */
  focusSkillId: string | null;
  /** Skill yếu nhất (node lá, level 0) — gợi ý luyện tiếp (FR-SK-09). */
  weakestSkillId: string | null;
}

export interface EvidenceEntryDTO {
  id: string;
  /** Mã định danh ngắn 6 ký tự để đối chiếu cục bộ (FR-SK-12). */
  shortId: string;
  skillId: string;
  skillName: string;
  activityId: string;
  rating: number;
  createdAt: string;
  /** Tiêu đề hoạt động. */
  activityTitle: string | null;
  /** Loại hoạt động. */
  activityType: string | null;
  /** Phút đã bỏ ra. */
  minutes: number | null;
  /** Nội dung chứng minh. */
  content: string | null;
}

export interface SkillDetailDTO {
  skill: SkillNodeDTO;
  /** Lịch sử bằng chứng (mới nhất trước). */
  evidence: EvidenceEntryDTO[];
  /** Tổng số bằng chứng (để phân trang). */
  evidenceTotal: number;
  /** Tiêu chuẩn thăng cấp còn thiếu (FR-SK-13). */
  promotion: PromotionCriteria;
  /** Level theo tuần (FR-SK-14). */
  timeline: WeeklyLevelPoint[];
  /** Phân bổ hoạt động theo loại (FR-SK-15). */
  activityDistribution: ActivityDistribution[];
  /** Số phút đã bỏ ra (chỉ hoạt động có bằng chứng). */
  minutesInvested: number;
  /** Điểm trung bình rating. */
  averageRating: number | null;
}

export interface PromotionCriteria {
  /** Tổng số bằng chứng ≥3★ cần để đạt mốc đích. */
  requiredEvidence: number;
  /** Số bằng chứng ≥3★ còn thiếu để đạt mốc đích. */
  missingStrongEvidence: number;
  /** Bằng chứng ≥3★ hiện có. */
  strongEvidence: number;
  /** Điểm trung bình tối thiểu cần có. */
  requiredAverageRating: number;
  /** Điểm trung bình hiện tại. */
  currentAverageRating: number | null;
  /** Nhịp duy trì: cần ≥1 bằng chứng trong 14 ngày. */
  requiredRecentEvidence: number;
  /** Số bằng chứng trong 14 ngày gần nhất. */
  recentEvidence: number;
  /** Điều kiện nào chưa đạt. */
  unmet: Array<"evidence" | "rating" | "maintenance">;
}

export interface WeeklyLevelPoint {
  /** Tuần (ISO week) — khoá `yyyy-Www`. */
  week: string;
  /** Level tính được ở cuối tuần đó. */
  level: number;
  /** Số bằng chứng đạt chuẩn tính đến cuối tuần. */
  strongEvidence: number;
}

export interface ActivityDistribution {
  /** Loại hoạt động. */
  type: string;
  /** Số bằng chứng. */
  count: number;
  /** Điểm trung bình rating. */
  averageRating: number | null;
}

/* ══ Hàm thuần ══════════════════════════════════════════════════════════ */

/**
 * Tính level từ số bằng chứng đạt chuẩn.
 *
 * Công thức FR-SK-03: `level = min(SKILL_LEVEL_MAX, ⌊strongCount / EVIDENCE_THRESHOLD⌋)`.
 */
export function computeLevelFromEvidence(strongEvidenceCount: number): number {
  if (strongEvidenceCount <= 0) return 0;
  return Math.min(SKILL_LEVEL_MAX, Math.floor(strongEvidenceCount / EVIDENCE_THRESHOLD));
}

/**
 * Level của node tầng 1 (domain) = MAX level của toàn bộ hậu duệ (FR-SK-07).
 */
export function computeDomainLevel(descendantLevels: readonly number[]): number {
  if (descendantLevels.length === 0) return 0;
  return Math.min(SKILL_LEVEL_MAX, Math.max(...descendantLevels));
}

/**
 * Đủ điều kiện thăng cấp chưa (FR-SK-13).
 *
 * ⚠️ P7 — không vanity metric: điều kiện phải đo được, không phải "cảm giác".
 */
export function evaluatePromotion(
  strongEvidence: number,
  averageRating: number | null,
  recentEvidence: number,
  targetLevel = 3,
  requiredAverageRating = 3,
): PromotionCriteria {
  // Ngưỡng bằng chứng để đạt **mốc đích** (`targetLevel`).
  //
  // ⚠️ Nhất quán với công thức level: `level = ⌊strong / THRESHOLD⌋` ⇒ đạt
  // `targetLevel` cần `strong ≥ targetLevel × THRESHOLD`.
  //
  // Mốc đích là `targetLevel` (không phải "bậc kế tiếp") vì đó là điều người
  // dùng nhìn thấy trên S04 ("Mục tiêu Cấp 3"). Nếu đã vượt mốc đích ⇒ 0.
  const requiredEvidence = targetLevel * EVIDENCE_THRESHOLD;
  const missingToNext = Math.max(0, requiredEvidence - strongEvidence);

  const ratingMet = averageRating !== null && averageRating >= requiredAverageRating;
  const maintenanceMet = recentEvidence >= 1;

  const unmet: PromotionCriteria["unmet"] = [];
  if (missingToNext > 0) unmet.push("evidence");
  if (!ratingMet) unmet.push("rating");
  if (!maintenanceMet) unmet.push("maintenance");

  return {
    requiredEvidence,
    missingStrongEvidence: missingToNext,
    strongEvidence,
    requiredAverageRating,
    currentAverageRating: averageRating,
    requiredRecentEvidence: 1,
    recentEvidence,
    unmet,
  };
}

/** Mã định danh ngắn 6 ký tự từ cuid (FR-SK-12). */
export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** Khoá tuần ISO — `yyyy-Www`. */
export function isoWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ══ Truy vấn ════════════════════════════════════════════════════════════ */

/**
 * Đọc cây kỹ năng 3 tầng + đếm bằng chứng (FR-SK-01, FR-SK-07).
 *
 * ⚠️ NFR-SK-04 — không N+1: 1 query lấy toàn bộ skill + 1 query `groupBy`
 * evidence + 1 query activity minutes. Tổng ≤ 3 query cho cây.
 */
export async function getSkillTree(): Promise<SkillTreeDTO> {
  const [skills, evidenceCounts, profile] = await Promise.all([
    prisma.skill.findMany({
      select: {
        id: true,
        name: true,
        nameZh: true,
        domain: true,
        parentId: true,
        level: true,
        targetLevel: true,
        position: true,
        evidences: { select: { rating: true } },
      },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.evidence.findMany({
      select: { skillId: true, rating: true },
    }),
    prisma.userProfile.findFirst({
      select: { focusSkillId: true },
    }),
  ]);

  // Tổng hợp theo skill.
  const bySkill = new Map<
    string,
    { count: number; strong: number; ratingSum: number }
  >();

  for (const evidence of evidenceCounts) {
    const bucket = bySkill.get(evidence.skillId) ?? { count: 0, strong: 0, ratingSum: 0 };
    bucket.count += 1;
    bucket.ratingSum += evidence.rating;
    if (evidence.rating >= EVIDENCE_RATING_MIN) bucket.strong += 1;
    bySkill.set(evidence.skillId, bucket);
  }

  const dtoFor = (skill: (typeof skills)[number]): SkillNodeDTO => {
    const bucket = bySkill.get(skill.id);
    const strong = bucket?.strong ?? 0;
    const count = bucket?.count ?? 0;

    return {
      id: skill.id,
      name: skill.name,
      nameZh: skill.nameZh,
      domain: skill.domain,
      parentId: skill.parentId,
      level: skill.level,
      targetLevel: skill.targetLevel,
      position: skill.position,
      evidenceCount: count,
      strongEvidenceCount: strong,
      averageRating:
        count > 0 ? Number(((bucket?.ratingSum ?? 0) / count).toFixed(2)) : null,
      minutesInvested: 0, // tính ở tầng chi tiết
      computedLevel: computeLevelFromEvidence(strong),
      children: [],
    };
  };

  // Dựng cây.
  const nodes = new Map<string, SkillNodeDTO>();
  for (const skill of skills) {
    nodes.set(skill.id, dtoFor(skill));
  }

  const roots: SkillNodeDTO[] = [];
  for (const skill of skills) {
    const node = nodes.get(skill.id)!;
    if (skill.parentId) {
      nodes.get(skill.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Tính level + phút cho từng node (domain = MAX hậu duệ).
  const minutesBySkill = await getMinutesBySkill();
  const assignAggregates = (node: SkillNodeDTO): number => {
    node.minutesInvested = minutesBySkill.get(node.id) ?? 0;

    if (node.children.length === 0) {
      node.computedLevel = computeLevelFromEvidence(node.strongEvidenceCount);
      return node.computedLevel;
    }

    const descendantLevels = node.children.map(assignAggregates);
    node.computedLevel = computeDomainLevel(descendantLevels);
    return node.computedLevel;
  };

  roots.forEach(assignAggregates);

  // Kỹ năng yếu nhất (node lá, level 0) — FR-SK-09.
  const leaves: SkillNodeDTO[] = [];
  const collectLeaves = (node: SkillNodeDTO) => {
    if (node.children.length === 0) leaves.push(node);
    else node.children.forEach(collectLeaves);
  };
  roots.forEach(collectLeaves);

  const weakest = leaves
    .filter((leaf) => leaf.computedLevel === 0)
    .sort((a, b) => a.evidenceCount - b.evidenceCount || a.name.localeCompare(b.name))[0];

  return {
    domains: roots,
    totalEvidence: evidenceCounts.length,
    totalStrongEvidence: evidenceCounts.filter((e) => e.rating >= EVIDENCE_RATING_MIN).length,
    domainCount: roots.length,
    leafCount: leaves.length,
    focusSkillId: profile?.focusSkillId ?? null,
    weakestSkillId: weakest?.id ?? null,
  };
}

/** Tổng phút theo skill — chỉ tính Activity có Evidence. */
async function getMinutesBySkill(): Promise<Map<string, number>> {
  const rows = await prisma.activity.findMany({
    where: { evidences: { some: {} } },
    select: {
      minutes: true,
      evidences: { select: { skillId: true } },
    },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    for (const evidence of row.evidences) {
      map.set(evidence.skillId, (map.get(evidence.skillId) ?? 0) + (row.minutes ?? 0));
    }
  }
  return map;
}

/**
 * Chi tiết 1 kỹ năng (FR-SK-05, FR-SK-12..FR-SK-15).
 */
export async function getSkillDetail(
  skillId: string,
  evidenceLimit = 50,
): Promise<SkillDetailDTO | null> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: {
      id: true,
      name: true,
      nameZh: true,
      domain: true,
      parentId: true,
      level: true,
      targetLevel: true,
      position: true,
      evidences: {
        select: { rating: true },
      },
    },
  });

  if (!skill) return null;

  const evidenceRows = await prisma.evidence.findMany({
    where: { skillId },
    orderBy: { createdAt: "desc" },
    take: evidenceLimit,
    select: {
      id: true,
      rating: true,
      createdAt: true,
      activityId: true,
      activity: {
        select: { title: true, type: true, minutes: true, content: true },
      },
    },
  });

  const evidenceTotal = await prisma.evidence.count({ where: { skillId } });

  const strongCount = skill.evidences.filter((e) => e.rating >= EVIDENCE_RATING_MIN).length;
  const totalCount = skill.evidences.length;
  const ratingSum = skill.evidences.reduce((sum, e) => sum + e.rating, 0);
  const averageRating = totalCount > 0 ? Number((ratingSum / totalCount).toFixed(2)) : null;

  const minutesBySkill = await getMinutesBySkill();
  const minutesInvested = minutesBySkill.get(skillId) ?? 0;

  // Nhịp duy trì: bằng chứng trong 14 ngày.
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);
  const recentEvidence = await prisma.evidence.count({
    where: { skillId, createdAt: { gte: fourteenDaysAgo } },
  });

  const timeline = await getLevelTimeline(skillId);
  const activityDistribution = await getActivityDistribution(skillId);

  return {
    skill: {
      id: skill.id,
      name: skill.name,
      nameZh: skill.nameZh,
      domain: skill.domain,
      parentId: skill.parentId,
      level: skill.level,
      targetLevel: skill.targetLevel,
      position: skill.position,
      evidenceCount: totalCount,
      strongEvidenceCount: strongCount,
      averageRating,
      minutesInvested,
      computedLevel: computeLevelFromEvidence(strongCount),
      children: [],
    },
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      shortId: shortId(row.id),
      skillId,
      skillName: skill.name,
      activityId: row.activityId,
      rating: row.rating,
      createdAt: row.createdAt.toISOString(),
      activityTitle: row.activity.title,
      activityType: row.activity.type,
      minutes: row.activity.minutes,
      content: row.activity.content,
    })),
    evidenceTotal,
    promotion: evaluatePromotion(
      strongCount,
      averageRating,
      recentEvidence,
      skill.targetLevel,
    ),
    timeline,
    activityDistribution,
    minutesInvested,
    averageRating,
  };
}

/**
 * Level theo tuần (FR-SK-14).
 *
 * ⚠️ Không vẽ chart rỗng — trả `[]` khi chưa có bằng chứng nào.
 */
async function getLevelTimeline(skillId: string): Promise<WeeklyLevelPoint[]> {
  const evidences = await prisma.evidence.findMany({
    where: { skillId },
    orderBy: { createdAt: "asc" },
    select: { rating: true, createdAt: true },
  });

  if (evidences.length === 0) return [];

  const byWeek = new Map<string, { strong: number; total: number; lastDate: Date }>();

  for (const evidence of evidences) {
    const key = isoWeekKey(evidence.createdAt);
    const bucket = byWeek.get(key) ?? { strong: 0, total: 0, lastDate: evidence.createdAt };
    bucket.total += 1;
    if (evidence.rating >= EVIDENCE_RATING_MIN) bucket.strong += 1;
    if (evidence.createdAt > bucket.lastDate) bucket.lastDate = evidence.createdAt;
    byWeek.set(key, bucket);
  }

  // Level tích luỹ: level ở cuối tuần = ⌊tổng BC đạt chuẩn tới đó / ngưỡng⌋.
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cumulativeStrong = 0;

  return weeks.map(([week, bucket]) => {
    cumulativeStrong += bucket.strong;
    return {
      week,
      level: computeLevelFromEvidence(cumulativeStrong),
      strongEvidence: cumulativeStrong,
    };
  });
}

/**
 * Phân bổ hoạt động theo loại (FR-SK-15).
 *
 * ⚠️ P7 — chỉ tính loại **có bằng chứng**.
 */
async function getActivityDistribution(skillId: string): Promise<ActivityDistribution[]> {
  const rows = await prisma.evidence.findMany({
    where: { skillId },
    select: { rating: true, activity: { select: { type: true } } },
  });

  const byType = new Map<string, { count: number; ratingSum: number }>();

  for (const row of rows) {
    const type = row.activity.type ?? "other";
    const bucket = byType.get(type) ?? { count: 0, ratingSum: 0 };
    bucket.count += 1;
    bucket.ratingSum += row.rating;
    byType.set(type, bucket);
  }

  return [...byType.entries()]
    .map(([type, bucket]) => ({
      type,
      count: bucket.count,
      averageRating: Number((bucket.ratingSum / bucket.count).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/* ══ Ghi ══════════════════════════════════════════════════════════════════ */

/**
 * Ghi bằng chứng — **đường ghi duy nhất** (FR-SK-03, task §11).
 *
 * Sau khi ghi, tính lại `level` của kỹ năng VÀ toàn bộ hậu duệ (node tầng 1
 * lấy MAX của hậu duệ).
 *
 * @returns level mới của kỹ năng sau khi tính lại.
 */
export async function recordEvidence(input: {
  skillId: string;
  activityId: string;
  rating: number;
}): Promise<{ evidenceId: string; level: number; strongEvidenceCount: number }> {
  if (input.rating < 1 || input.rating > 4) {
    throw new RangeError("rating phải trong 1..4");
  }

  const evidence = await prisma.evidence.create({
    data: {
      skillId: input.skillId,
      activityId: input.activityId,
      rating: input.rating,
    },
    select: { id: true },
  });

  const { level, strongEvidenceCount } = await recalculateSkillLevels(input.skillId);
  return { evidenceId: evidence.id, level, strongEvidenceCount };
}

/**
 * Tính lại `level` cho 1 kỹ năng và mọi node tổ tiên.
 *
 * ⚠️ Node tầng 1 = MAX level hậu duệ ⇒ phải đi **lên** (tới root), không
 * chỉ đi xuống.
 */
export async function recalculateSkillLevels(
  skillId: string,
): Promise<{ level: number; strongEvidenceCount: number }> {
  return prisma.$transaction(async (tx) => {
    // 1. Level của node này.
    const strongCount = await tx.evidence.count({
      where: { skillId, rating: { gte: EVIDENCE_RATING_MIN } },
    });
    const level = computeLevelFromEvidence(strongCount);

    await tx.skill.update({ where: { id: skillId }, data: { level } });

    // 2. Đi lên các node tổ tiên: level = MAX hậu duệ.
    let parentId = await tx.skill
      .findUnique({ where: { id: skillId }, select: { parentId: true } })
      .then((row) => row?.parentId ?? null);

    while (parentId) {
      const children = await tx.skill.findMany({
        where: { parentId },
        select: { id: true, level: true },
      });

      const maxChildLevel = Math.max(0, ...children.map((child) => child.level));
      await tx.skill.update({
        where: { id: parentId },
        data: { level: Math.min(SKILL_LEVEL_MAX, maxChildLevel) },
      });

      parentId = await tx.skill
        .findUnique({ where: { id: parentId }, select: { parentId: true } })
        .then((row) => row?.parentId ?? null);
    }

    return { level, strongEvidenceCount: strongCount };
  });
}

/**
 * Đặt trọng tâm hôm nay (FR-SK-08) — chỉ một kỹ năng tại một thời điểm.
 */
export async function setFocusSkill(skillId: string): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true },
  });
  if (!skill) throw new Error("skill_not_found");

  // 1 profile ⇒ 1 focus. Xoá focus cũ rồi đặt mới.
  await prisma.userProfile.updateMany({
    where: { focusSkillId: { not: null } },
    data: { focusSkillId: null },
  });

  await prisma.userProfile.updateMany({
    where: {},
    data: { focusSkillId: skillId },
  });
}

/**
 * Tạo node mới (FR-SK-04) — tối đa tầng 3.
 */
export async function createSkill(input: {
  name: string;
  domain: string;
  parentId: string | null;
  targetLevel: number;
  nameZh?: string | null;
}): Promise<string> {
  if (input.parentId) {
    const parent = await prisma.skill.findUnique({
      where: { id: input.parentId },
      select: { parentId: true, domain: true },
    });

    if (!parent) throw new Error("parent_not_found");
    if (parent.domain !== input.domain) throw new Error("domain_mismatch");

    // ⚠️ Tầng của node mới = tầng(cha) + 1. Chỉ chặn khi vượt tầng 3.
    //
    // ⚠️ Bug cũ: kiểm tra `if (parent.parentId)` ⇒ chặn nhầm node **tầng 2**
    // (tầng 2 có cha) ⇒ không tạo được node tầng 3. Phải tính depth thật:
    //   cha tầng 1 (parentId = null)        → node mới tầng 2 ✔
    //   cha tầng 2 (ông bà tồn tại)        → node mới tầng 3 ✔
    //   cha tầng 3 (ông bà cũng có cha)    → node mới tầng 4 ✘
    const parentDepth = await resolveDepth(input.parentId);
    if (parentDepth + 1 > 3) throw new Error("max_depth_exceeded");
  }

  const created = await prisma.skill.create({
    data: {
      name: input.name,
      nameZh: input.nameZh ?? null,
      domain: input.domain,
      parentId: input.parentId,
      targetLevel: input.targetLevel,
      level: 0,
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Xoá node (FR-SK-11) — node con được **chuyển lên ông bà**, không mất dữ liệu.
 */
export async function deleteSkill(skillId: string): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true, parentId: true },
  });
  if (!skill) throw new Error("skill_not_found");

  const grandparentId = skill.parentId
    ? await prisma.skill
        .findUnique({ where: { id: skill.parentId }, select: { parentId: true } })
        .then((row) => row?.parentId ?? null)
    : null;

  await prisma.$transaction(async (tx) => {
    // Chuyển node con lên ông bà.
    await tx.skill.updateMany({
      where: { parentId: skillId },
      data: { parentId: grandparentId },
    });

    // Evidence của node bị xoá cascade (theo schema `onDelete: Cascade`).
    await tx.skill.delete({ where: { id: skillId } });
  });

  // Tính lại level của các node tổ tiên còn lại.
  if (grandparentId) {
    await recalculateAncestors(grandparentId);
  }
}

/** Tính lại level từ 1 node lên tới root. */
async function recalculateAncestors(skillId: string): Promise<void> {
  let currentId: string | null = skillId;

  while (currentId) {
    const children = await prisma.skill.findMany({
      where: { parentId: currentId },
      select: { level: true },
    });
    const maxChildLevel = Math.max(0, ...children.map((child) => child.level));

    await prisma.skill.update({
      where: { id: currentId },
      data: { level: Math.min(SKILL_LEVEL_MAX, maxChildLevel) },
    });

    currentId = await prisma.skill
      .findUnique({ where: { id: currentId }, select: { parentId: true } })
      .then((row) => row?.parentId ?? null);
  }
}

/**
 * Tính tầng của 1 node (1 = domain, 2 = kỹ năng, 3 = mục con).
 *
 * ⚠️ `resolveDepth` là nguồn sự thật cho quy tắc "cây chỉ có 3 tầng" —
 * dùng chung cho `createSkill` và `PATCH` (đổi cha) để 2 đường không lệch nhau.
 */
export async function resolveDepth(skillId: string): Promise<number> {
  // Tầng = số node trên đường đi từ node này lên domain gốc.
  //
  //   domain (parentId = null)  → tầng 1
  //   con của domain             → tầng 2
  //   con của con                → tầng 3
  //
  // ⚠️ Đếm NGƯỢC từ node lên root: mỗi lần đi lên 1 bậc là +1 tầng.
  let depth = 1;
  let currentId: string | null = skillId;

  while (currentId) {
    const row: { parentId: string | null } | null = await prisma.skill.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!row) break;

    // Node này CÓ cha ⇒ nó nằm dưới domain ⇒ tầng của node cha = tầng này + 1.
    if (row.parentId) {
      depth += 1;
      currentId = row.parentId;
    } else {
      // Node cha gốc (domain) ⇒ dừng. `depth` đã là tầng của chính node này.
      break;
    }

    // Chặn vòng lặp vô hạn nếu dữ liệu rác.
    if (depth > 10) break;
  }

  return depth;
}
