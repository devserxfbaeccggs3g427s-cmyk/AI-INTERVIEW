/**
 * Truy vấn dữ liệu cây kỹ năng cho S03 (`/skills`) và S04 (`/skills/[id]`).
 *
 * Tách riêng khỏi page/component để:
 *   - Server Component gọi trực tiếp (không kéo Prisma vào bundle client).
 *   - Số liệu KPI / bảng / biểu đồ luôn đọc từ **cùng một nguồn**,
 *     tránh tình trạng header và bảng lệch nhau.
 *
 * Xem tasks.md 7.1 / 7.6 / 7.7 / 7.10 / 7.11 · design.md §4.3–§4.4.
 */

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { addDays, startOfDay, startOfWeek } from "@/lib/dates";
import { LEVEL_THRESHOLDS, MAX_LEVEL } from "@/lib/levels";
import { ACTIVITY_TYPE_LABELS, DOMAINS, type ActivityType, type Domain } from "@/lib/types";

/** Node cây kỹ năng — đủ dữ liệu để vẽ tầng 2 & tầng 3 + panel chi tiết. */
export type SkillNodeDTO = {
  id: string;
  name: string;
  domain: Domain;
  parentId: string | null;
  level: number;
  targetLevel: number;
  /** Tổng số bằng chứng (mọi rating). */
  evidenceCount: number;
  /** Số bằng chứng chất lượng (rating >= 3) — chỉ số này mới tính lên level. */
  qualifyingCount: number;
  /** Điểm trung bình 1–4 (làm tròn 1 chữ số). */
  averageRating: number;
  /** Tổng phút đã bỏ ra cho node này. */
  minutes: number;
  /** Ngày tạo — dùng cho thứ tự ổn định trong cây. */
  createdAt: string;
};

/** Kiểu domain hợp lệ — `Skill.domain` lưu chuỗi, ta ép về `Domain`. */
function toDomain(value: string): Domain {
  return (DOMAINS as readonly string[]).includes(value) ? (value as Domain) : "personal";
}

/**
 * Toàn bộ cây kỹ năng (3 tầng) kèm số liệu bằng chứng / thời gian.
 *
 * Truy vấn 1 lần với `include` để tránh N+1 — cây nhỏ nhưng S03 render
 * lại toàn bộ node mỗi lần đổi trọng tâm.
 */
export async function getSkillTreeNodes(): Promise<SkillNodeDTO[]> {
  const skills = await prisma.skill.findMany({
    include: {
      evidences: { select: { rating: true } },
      activities: { select: { minutes: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return skills.map((s) => {
    const total = s.evidences.length;
    const sum = s.evidences.reduce((acc, e) => acc + e.rating, 0);
    return {
      id: s.id,
      name: s.name,
      domain: toDomain(s.domain),
      parentId: s.parentId,
      level: s.level,
      targetLevel: s.targetLevel,
      evidenceCount: total,
      qualifyingCount: s.evidences.filter((e) => e.rating >= 3).length,
      averageRating: total === 0 ? 0 : Math.round((sum / total) * 10) / 10,
      minutes: s.activities.reduce((acc, a) => acc + a.minutes, 0),
      createdAt: s.createdAt.toISOString(),
    };
  });
}

/** KPI đầu trang S03 (task 7.6) — số liệu thật, không hardcode. */
export type SkillsKpi = {
  /** Tổng bằng chứng toàn hệ thống. */
  totalEvidence: number;
  /** Tổng số domain đang có skill (tối đa 4). */
  domainCount: number;
  /** Số mục kỹ năng còn thiếu bằng chứng so với mục tiêu (level < targetLevel). */
  awaitingCount: number;
  /** Trọng tâm hôm nay + rating trung bình của nó. */
  focus: {
    skillId: string | null;
    name: string | null;
    averageRating: number;
    evidenceCount: number;
  };
};

export async function getSkillsKpi(
  nodes: SkillNodeDTO[],
  focusSkillId: string | null,
): Promise<SkillsKpi> {
  const totalEvidence = nodes.reduce((acc, n) => acc + n.evidenceCount, 0);

  const domains = new Set(nodes.map((n) => n.domain));
  const awaitingCount = nodes.filter((n) => n.level < n.targetLevel).length;

  const focusNode = focusSkillId ? nodes.find((n) => n.id === focusSkillId) : undefined;

  return {
    totalEvidence,
    domainCount: domains.size,
    awaitingCount,
    focus: {
      skillId: focusNode?.id ?? null,
      name: focusNode?.name ?? null,
      averageRating: focusNode?.averageRating ?? 0,
      evidenceCount: focusNode?.evidenceCount ?? 0,
    },
  };
}

/** Một dòng trong feed "Bằng Chứng Gần Đây" (task 7.5). */
export type EvidenceFeedItem = {
  id: string;
  title: string;
  /** Nội dung hoạt động — dùng làm mô tả phụ. */
  content: string | null;
  rating: number;
  activityType: ActivityType;
  activityLabel: string;
  skillId: string;
  skillName: string;
  domain: Domain;
  createdAt: string;
};

/**
 * Feed bằng chứng gần đây — sắp xếp **thời gian giảm dần** (task 7.5).
 *
 * `limit` mặc định 20 — đủ cho panel 3 cột ở S03.
 */
export async function getRecentEvidences(limit = 20): Promise<EvidenceFeedItem[]> {
  const evidences = await prisma.evidence.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      activity: { select: { title: true, content: true, type: true, domain: true } },
      skill: { select: { id: true, name: true } },
    },
  });

  return evidences.map((e) => {
    const type = (ACTIVITY_TYPE_LABELS as Record<string, string>)[e.activity.type];
    return {
      id: e.id,
      title: e.activity.title,
      content: e.activity.content,
      rating: e.rating,
      activityType: (e.activity.type as ActivityType) ?? "custom",
      activityLabel: type ?? "Khác",
      skillId: e.skill.id,
      skillName: e.skill.name,
      domain: toDomain(e.activity.domain),
      createdAt: e.createdAt.toISOString(),
    };
  });
}

/** Chi tiết 1 skill + chuỗi cha (để dựng breadcrumb 4 cấp). */
export type SkillDetailDTO = {
  id: string;
  name: string;
  domain: Domain;
  level: number;
  targetLevel: number;
  evidenceCount: number;
  qualifyingCount: number;
  averageRating: number;
  minutes: number;
  createdAt: string;
  /** Đường dẫn từ gốc: [domain?, skill, ...] — dùng cho breadcrumb. */
  ancestors: Array<{ id: string; name: string }>;
};

export async function getSkillDetail(id: string): Promise<SkillDetailDTO | null> {
  const skill = await prisma.skill.findUnique({
    where: { id },
    include: {
      evidences: { select: { rating: true } },
      activities: { select: { minutes: true } },
    },
  });

  if (!skill) return null;

  const total = skill.evidences.length;
  const sum = skill.evidences.reduce((acc, e) => acc + e.rating, 0);

  // Chuỗi cha từ gốc xuống — cây chỉ 3 tầng nên duyệt tối đa 2 cấp cha.
  // Dùng vòng lặp `findUnique` thay vì `include` lồng nhau: kiểu trả về của
  // Prisma cho include nhiều tầng khó suy luận với `noUncheckedIndexedAccess`.
  const ancestors: Array<{ id: string; name: string }> = [];
  let parentId: string | null = skill.parentId;
  let guard = 0;
  while (parentId && guard < 8) {
    const parent = await prisma.skill.findUnique({
      where: { id: parentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!parent) break;
    ancestors.unshift({ id: parent.id, name: parent.name });
    parentId = parent.parentId;
    guard += 1;
  }

  return {
    id: skill.id,
    name: skill.name,
    domain: toDomain(skill.domain),
    level: skill.level,
    targetLevel: skill.targetLevel,
    evidenceCount: total,
    qualifyingCount: skill.evidences.filter((e) => e.rating >= 3).length,
    averageRating: total === 0 ? 0 : Math.round((sum / total) * 10) / 10,
    minutes: skill.activities.reduce((acc, a) => acc + a.minutes, 0),
    createdAt: skill.createdAt.toISOString(),
    ancestors,
  };
}

/**
 * Bảng "Nhật ký bằng chứng" (task 7.10).
 *
 * `hash` là hash **ổn định** của `evidence.id` (sha256 cắt 8 ký tự) —
 * dùng để tra cứu nhanh trong DB cục bộ mà không lộ id thô.
 */
export type EvidenceRowDTO = {
  id: string;
  /** Ngày hiển thị dạng `dd/MM/yyyy`. */
  date: string;
  dateISO: string;
  activityType: ActivityType;
  activityLabel: string;
  title: string;
  content: string | null;
  rating: number;
  minutes: number;
  /** `HASH#xxxxxxxx` — hiển thị mono. */
  hash: string;
};

export function evidenceHash(id: string): string {
  return `HASH#${createHash("sha256").update(id).digest("hex").slice(0, 8).toUpperCase()}`;
}

export async function getEvidenceRows(skillId: string): Promise<EvidenceRowDTO[]> {
  const evidences = await prisma.evidence.findMany({
    where: { skillId },
    orderBy: { createdAt: "desc" },
    include: {
      activity: { select: { title: true, content: true, type: true, minutes: true } },
    },
  });

  return evidences.map((e) => {
    const d = new Date(e.createdAt);
    const label = (ACTIVITY_TYPE_LABELS as Record<string, string>)[e.activity.type] ?? "Khác";
    return {
      id: e.id,
      date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      dateISO: d.toISOString(),
      activityType: (e.activity.type as ActivityType) ?? "custom",
      activityLabel: label,
      title: e.activity.title,
      content: e.activity.content,
      rating: e.rating,
      minutes: e.activity.minutes,
      hash: evidenceHash(e.id),
    };
  });
}

/** 6 danh mục hoạt động của biểu đồ cột (task 7.9) — nhãn tiếng Việt. */
export const ACTIVITY_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  /** Các `Activity.type` gộp vào danh mục này. */
  types: ActivityType[];
}> = [
  { key: "study", label: "Học", types: ["study"] },
  { key: "practice", label: "Luyện tập", types: ["roleplay", "mock_interview", "test"] },
  { key: "write", label: "Viết", types: ["write"] },
  { key: "speak", label: "Nói", types: ["speak"] },
  { key: "srs", label: "Ôn", types: ["srs"] },
  {
    key: "journal",
    label: "Nhật ký",
    types: ["journal", "health", "custom"],
  },
];

/** Phân bổ hoạt động theo 6 danh mục + số bản ghi/rating TB của từng danh mục. */
export type ActivityBucketDTO = {
  key: string;
  label: string;
  count: number;
  averageRating: number;
};

export async function getActivityDistribution(skillId: string): Promise<ActivityBucketDTO[]> {
  const activities = await prisma.activity.findMany({
    where: { skillId },
    select: { type: true, evidences: { select: { rating: true } } },
  });

  return ACTIVITY_BUCKETS.map((bucket) => {
    const inBucket = activities.filter((a) => bucket.types.includes(a.type as ActivityType));
    const ratings = inBucket.flatMap((a) => a.evidences.map((e) => e.rating));
    const sum = ratings.reduce((acc, r) => acc + r, 0);
    return {
      key: bucket.key,
      label: bucket.label,
      count: inBucket.length,
      averageRating: ratings.length === 0 ? 0 : Math.round((sum / ratings.length) * 10) / 10,
    };
  });
}

/** Một điểm trên biểu đồ đường: bằng chứng tích lũy theo tuần (task 7.8). */
export type WeeklyProgressPoint = {
  /** Nhãn tuần, ví dụ "Tuần 44". */
  label: string;
  /** Tổng bằng chứng rating >= 3 tính đến hết tuần này. */
  cumulative: number;
  /** Bằng chứng rating >= 3 tạo ra trong tuần này. */
  weekly: number;
};

/**
 * Tiến trình xác thựnh theo tuần — cộng dồn bằng chứng chất lượng (rating >= 3).
 *
 * FR-SK-03: chỉ bằng chứng `rating >= 3` mới được tính vào thang level,
 * nên biểu đồ cũng chỉ dùng bằng chứng loại này cho đường tích lũy.
 */
export async function getWeeklyProgress(
  skillId: string,
  weeks = 8,
): Promise<WeeklyProgressPoint[]> {
  const now = new Date();
  const thisWeek = startOfWeek(now);
  const from = addDays(thisWeek, -7 * (weeks - 1));

  const evidences = await prisma.evidence.findMany({
    where: { skillId, rating: { gte: 3 }, createdAt: { gte: from } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const points: WeeklyProgressPoint[] = [];
  let cumulative = 0;

  for (let i = 0; i < weeks; i += 1) {
    const weekStart = addDays(from, 7 * i);
    const weekEnd = addDays(weekStart, 7);
    const weekly = evidences.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= weekStart.getTime() && t < weekEnd.getTime();
    }).length;
    cumulative += weekly;
    points.push({
      label: `Tuần ${getIsoWeekNumber(weekStart)}`,
      cumulative,
      weekly,
    });
  }

  return points;
}

/** Số tuần ISO của một ngày — dùng làm nhãn trục X. */
function getIsoWeekNumber(date: Date): number {
  const d = startOfDay(date);
  // Thứ Tư của tuần ISO quyết định số tuần.
  const day = (d.getDay() + 6) % 7; // Thứ Hai = 0
  d.setDate(d.getDate() - day + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/**
 * Đề xuất bài tập thực chiến từ **lỗ hổng bằng chứng** (task 7.12).
 *
 * Ưu tiên **rule cục bộ** (không gọi AI) để tính năng không phụ thuộc mạng —
 * `AiSuggestionCard` chỉ cần 1 đề xuất khả dụng ngay, kể cả khi offline.
 *
 * Luật: xem loại hoạt động nào đang **thiếu** bằng chứng so với mục tiêu
 * level → đề xuất bài tập thuộc loại đó, với thời lượng gợi ý theo domain.
 */
export type PracticeSuggestion = {
  /** Tiêu đề bài tập. */
  title: string;
  /** Mô tả cách làm cụ thể. */
  requirement: string;
  /** Thời lượng gợi ý (phút). */
  minutes: number;
  /** Loại hoạt động nên dùng khi ghi bằng chứng. */
  activityType: ActivityType;
  /** Loại hoạt động đang thiếu — dùng làm "lỗ hổng phân tích được". */
  gapType: ActivityType;
  /** Tên loại hoạt động (tiếng Việt). */
  gapLabel: string;
  /** Số bằng chứng còn thiếu để lên level kế tiếp. */
  missing: number;
};

const DOMAIN_MINUTES: Record<Domain, number> = {
  professional: 35,
  communication: 25,
  language: 20,
  personal: 15,
};

/** Bài tập mẫu cho từng loại hoạt động — nội dung cụ thể, làm được ngay. */
const PRACTICE_TEMPLATES: Record<
  ActivityType,
  { title: string; requirement: string }
> = {
  study: {
    title: "Đọc tài liệu gốc & tóm tắt thành 5 ý chính",
    requirement:
      "Đọc tài liệu gốc của chủ đề này, chép lại 5 ý chính và 1 câu hỏi chưa rõ. Ghi lại bằng chứng là chính 5 ý đó.",
  },
  write: {
    title: "Viết 1 tài liệu 500 từ theo yêu cầu thật",
    requirement:
      "Viết 500 từ có ràng buộc (mục tiêu, đối tượng, 3 tiêu chí chấm điểm) và tự chấm theo 3 tiêu chí đã định.",
  },
  speak: {
    title: "Nói 60 giây không dừng về chủ đề này",
    requirement:
      "Ghi âm 60 giây trình bày tự nhiên về chủ đề: vấn đề → giải pháp → rủi ro chính. Nghe lại và ghi lại điểm yếu.",
  },
  roleplay: {
    title: "Đóng vai tình huống thực tế",
    requirement:
      "Mô phỏng một tình huống có thật ở chủ đề này với đối tác AI, trả lời ít nhất 5 lượt, rồi ghi lại điều chưa trả lời được.",
  },
  mock_interview: {
    title: "Phiên mock interview chủ đề này",
    requirement:
      "Chạy 1 phiên mock interview tập trung vào chủ đề. Ghi lại 3 câu hỏi khó nhất và câu trả lời của bạn.",
  },
  test: {
    title: "Bài kiểm tra có chấm điểm",
    requirement:
      "Làm bài kiểm tra có rubric cho chủ đề này. Chấm theo rubric và ghi lại mục bị trừ điểm nhiều nhất.",
  },
  srs: {
    title: "Ôn lại toàn bộ thẻ SRS đã học",
    requirement:
      "Ôn 20 thẻ SRS đã từng học ở chủ đề này, đánh dấu thẻ sai và viết lại 1 câu tự nhắc cho mỗi thẻ sai.",
  },
  journal: {
    title: "Nhật ký phản tư sau buổi học",
    requirement:
      "Viết 5 phút: hôm nay mình chốt được điều gì, còn hổng điều gì, và bài tập tiếp theo là gì.",
  },
  health: {
    title: "Hoạt động thể chất 30 phút",
    requirement:
      "Đi bộ hoặc tập thể dục 30 phút, ghi lại bước chân / thời lượng / mức năng lượng sau buổi tập.",
  },
  custom: {
    title: "Bài tập tự do theo chủ đề",
    requirement:
      "Tự thiết kế một bài tập 30 phút cho chủ đề này, làm xong và ghi lại kết quả cùng điều chưa đạt.",
  },
};

/**
 * Dựng đề xuất bài tập cho 1 skill.
 *
 * `rows` là lịch sử bằng chứng của skill — dùng để biết loại hoạt động nào
 * đang **thiếu** (chưa có bằng chứng nào) so với các loại đã có.
 */
export function buildPracticeSuggestion(
  detail: SkillDetailDTO,
  rows: EvidenceRowDTO[],
): PracticeSuggestion {
  const nextLevel = Math.min(MAX_LEVEL, detail.level + 1);
  const required = LEVEL_THRESHOLDS[nextLevel] ?? LEVEL_THRESHOLDS[MAX_LEVEL] ?? 0;
  const missing = Math.max(0, required - detail.qualifyingCount);

  // Đếm bằng chứng theo loại hoạt động để tìm "lỗ hổng".
  const countByType = new Map<string, number>();
  for (const row of rows) {
    countByType.set(row.activityType, (countByType.get(row.activityType) ?? 0) + 1);
  }

  // Thứ tự ưu tiên loại bài tập theo domain — bắt đầu từ loại phù hợp nhất.
  const preferred: ActivityType[] =
    detail.domain === "communication"
      ? ["speak", "roleplay", "mock_interview", "write"]
      : detail.domain === "language"
        ? ["speak", "srs", "write", "test"]
        : detail.domain === "personal"
          ? ["journal", "health", "custom"]
          : ["study", "write", "mock_interview", "roleplay"];

  const gapType =
    preferred.find((t) => (countByType.get(t) ?? 0) === 0) ?? preferred[0] ?? "study";

  const template = PRACTICE_TEMPLATES[gapType];
  const gapLabel = ACTIVITY_TYPE_LABELS[gapType] ?? "Khác";

  return {
    title: `${template.title} — ${detail.name}`,
    requirement: template.requirement,
    minutes: DOMAIN_MINUTES[detail.domain],
    activityType: gapType,
    gapType,
    gapLabel,
    missing,
  };
}

/**
 * Tiêu chuẩn thăng cấp (task 7.11).
 *
 * Với mỗi level từ `current + 1` → `targetLevel`, tick đạt khi số bằng chứng
 * `rating >= 3` đã đạt ngưỡng `LEVEL_THRESHOLDS[level]`.
 */
export type LevelCriterion = {
  level: number;
  /** Số bằng chứng cần có để đạt level này. */
  required: number;
  /** Số bằng chứng chất lượng hiện có. */
  current: number;
  done: boolean;
};

export function buildLevelChecklist(
  currentLevel: number,
  targetLevel: number,
  qualifyingCount: number,
): LevelCriterion[] {
  const items: LevelCriterion[] = [];
  for (let lv = currentLevel + 1; lv <= targetLevel; lv += 1) {
    const required = LEVEL_THRESHOLDS[lv] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] ?? 0;
    items.push({
      level: lv,
      required,
      current: qualifyingCount,
      done: qualifyingCount >= required,
    });
  }
  return items;
}
