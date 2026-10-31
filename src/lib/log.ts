import { prisma } from "@/lib/db";
import { EVIDENCE_RATING_MIN, EVIDENCE_THRESHOLD } from "@/lib/config";
import { recalculateSkillLevels } from "@/lib/skills";
import { addDays, normalizeDate, toDateKey } from "@/lib/dates";

/**
 * Lớp nghiệp vụ Quick-log (S05).
 *
 * ⚠️ P2 — **ghi nhận dưới 10 giây**: đường ghi chính KHÔNG chờ AI. Autofill
 * (AI-02) chạy nền và chỉ *gợi ý*; người dùng bấm Enter là ghi ngay.
 *
 * ⚠️ FR-QL-09 — chống ghi trùng: server dedupe theo cửa sổ thời gian, không
 * chỉ khoá nút ở client (client có thể gửi 2 request song song).
 */

export type LogDomain = "professional" | "communication" | "language" | "personal";

export type LogType =
  | "study"
  | "write"
  | "speak"
  | "srs"
  | "journal"
  | "health"
  | "custom";

export type LogLanguage = "en" | "zh" | "vi";

export interface LogDraft {
  /** Mô tả người dùng gõ (≥ 3 ký tự để kích hoạt autofill). */
  text: string;
  domain: LogDomain;
  type: LogType;
  /** Thời lượng (phút). */
  minutes: number;
  /** Kỹ năng gắn (null = không tạo Evidence). */
  skillId: string | null;
  /** Mức độ khó 1–4 ⇒ `Evidence.rating`. */
  difficulty: number | null;
  /** Ghi chú tuỳ chọn. */
  note?: string | null;
  /** Ngôn ngữ (chỉ hoạt động ngoại ngữ). */
  language?: LogLanguage | null;
  /** Tạo Evidence hay không (mặc định true nếu có skillId). */
  createEvidence: boolean;
}

export interface LogEntry {
  id: string;
  title: string;
  content: string | null;
  domain: LogDomain;
  type: LogType;
  minutes: number;
  skillId: string | null;
  skillName: string | null;
  difficulty: number | null;
  language: LogLanguage | null;
  note: string | null;
  /** Điểm tự đánh giá (1..5) — legacy, quick-log dùng `difficulty`. */
  quality: number | null;
  createdAt: string;
  /** Đã có Evidence chưa. */
  hasEvidence: boolean;
}

/**
 * Cửa sổ dedupe (giây) — 2 lần ghi cùng nội dung trong khoảng này bị coi là 1.
 */
export const LOG_DEDUPE_WINDOW_SECONDS = 10;

/**
 * Ghi 1 hoạt động (FR-QL-08).
 *
 * - Tạo đúng **1 `Activity`**.
 * - Tạo **0–1 `Evidence`** (chỉ khi có `skillId` và `createEvidence`).
 * - `Evidence.rating` = mức độ khó người dùng chọn (1–4).
 * - Sau khi ghi, tính lại `level` của kỹ năng (FR-SK-03).
 */
export async function writeLog(input: LogDraft): Promise<LogEntry> {
  const trimmed = input.text.trim();

  if (trimmed.length === 0) {
    throw new Error("empty_text");
  }

  // ⚠️ FR-QL-24 — `vi` là bản ngữ ⇒ KHÔNG tạo Evidence SRS.
  // Quick-log không tạo Evidence SRS nói chung; chỉ tạo Evidence kỹ năng.
  const shouldCreateEvidence =
    input.createEvidence &&
    input.skillId !== null &&
    input.difficulty !== null &&
    input.difficulty >= 1 &&
    input.difficulty <= 4;

  const activity = await prisma.activity.create({
    data: {
      skillId: input.skillId,
      domain: input.domain,
      type: input.type,
      minutes: input.minutes,
      title: trimmed.slice(0, 160),
      content: input.note?.trim() || null,
      quality: input.difficulty ?? null,
      language: input.language ?? null,
    },
    select: { id: true },
  });

  // ⚠️ Bind local — `shouldCreateEvidence` là boolean, TS không narrow
  // `input.difficulty` qua nó (vẫn là `number | null`).
  const { skillId, difficulty } = input;

  if (shouldCreateEvidence && skillId && difficulty !== null) {
    await prisma.evidence.create({
      data: {
        activityId: activity.id,
        skillId,
        rating: difficulty,
      },
    });

    // Tính lại level kỹ năng + node tổ tiên.
    await recalculateSkillLevels(skillId);
  }

  return getLogEntry(activity.id);
}

/**
 * Dedupe: nếu có hoạt động cùng `title` + `domain` trong cửa sổ thời gian ⇒
 * trả về hoạt động cũ thay vì tạo mới (FR-QL-09).
 */
export async function writeLogWithDedupe(
  input: LogDraft,
): Promise<{ entry: LogEntry; deduplicated: boolean }> {
  const trimmed = input.text.trim();

  const existing = await prisma.activity.findFirst({
    where: {
      title: trimmed.slice(0, 160),
      domain: input.domain,
      createdAt: {
        gte: new Date(Date.now() - LOG_DEDUPE_WINDOW_SECONDS * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    return { entry: await getLogEntry(existing.id), deduplicated: true };
  }

  return { entry: await writeLog(input), deduplicated: false };
}

/** Đọc 1 mục log + tên kỹ năng. */
export async function getLogEntry(id: string): Promise<LogEntry> {
  const row = await prisma.activity.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      domain: true,
      type: true,
      minutes: true,
      skillId: true,
      quality: true,
      language: true,
      createdAt: true,
      skill: { select: { name: true } },
      evidences: { select: { id: true }, take: 1 },
    },
  });

  if (!row) throw new Error("log_not_found");

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    domain: row.domain as LogDomain,
    type: row.type as LogType,
    minutes: row.minutes,
    skillId: row.skillId,
    skillName: row.skill?.name ?? null,
    difficulty: row.quality,
    language: (row.language as LogLanguage | null) ?? null,
    note: row.content,
    quality: row.quality,
    createdAt: row.createdAt.toISOString(),
    hasEvidence: row.evidences.length > 0,
  };
}

/**
 * Lịch sử theo ngày + lọc domain (FR-QL-10).
 */
export async function getLogHistory(options: {
  date?: Date;
  domain?: LogDomain | "all";
  limit?: number;
  offset?: number;
}): Promise<{ items: LogEntry[]; total: number }> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);

  const where: Record<string, unknown> = {};

  if (options.date) {
    const day = normalizeDate(options.date);
    where.createdAt = {
      gte: day,
      lt: addDays(day, 1),
    };
  }

  if (options.domain && options.domain !== "all") {
    where.domain = options.domain;
  }

  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        domain: true,
        type: true,
        minutes: true,
        skillId: true,
        quality: true,
        language: true,
        createdAt: true,
        skill: { select: { name: true } },
        evidences: { select: { id: true }, take: 1 },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      domain: row.domain as LogDomain,
      type: row.type as LogType,
      minutes: row.minutes,
      skillId: row.skillId,
      skillName: row.skill?.name ?? null,
      difficulty: row.quality,
      language: (row.language as LogLanguage | null) ?? null,
      note: row.content,
      quality: row.quality,
      createdAt: row.createdAt.toISOString(),
      hasEvidence: row.evidences.length > 0,
    })),
    total,
  };
}

/**
 * Sửa 1 mục lịch sử (FR-QL-11).
 *
 * ⚠️ Sửa mức độ khó ⇒ phải cập nhật `Evidence.rating` **và** tính lại
 * `level` của kỹ năng bị ảnh hưởng.
 */
export async function updateLog(
  id: string,
  patch: Partial<LogDraft>,
): Promise<LogEntry> {
  const existing = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, skillId: true, evidences: { select: { id: true } } },
  });

  if (!existing) throw new Error("log_not_found");

  await prisma.activity.update({
    where: { id },
    data: {
      ...(patch.text !== undefined ? { title: patch.text.trim().slice(0, 160) } : {}),
      ...(patch.domain !== undefined ? { domain: patch.domain } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.minutes !== undefined ? { minutes: patch.minutes } : {}),
      ...(patch.skillId !== undefined ? { skillId: patch.skillId } : {}),
      ...(patch.difficulty !== undefined ? { quality: patch.difficulty ?? null } : {}),
      ...(patch.note !== undefined ? { content: patch.note?.trim() || null } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
    },
  });

  // Cập nhật Evidence nếu có và mức độ khó thay đổi.
  if (patch.difficulty !== undefined && patch.difficulty !== null && existing.evidences.length > 0) {
    await prisma.evidence.updateMany({
      where: { activityId: id },
      data: { rating: patch.difficulty },
    });
  }

  // Tính lại level cho kỹ năng cũ (nếu đổi skill) và kỹ năng mới.
  const affected = new Set<string>();
  if (existing.skillId) affected.add(existing.skillId);
  if (patch.skillId) affected.add(patch.skillId);

  for (const skillId of affected) {
    await recalculateSkillLevels(skillId);
  }

  return getLogEntry(id);
}

/**
 * Xoá 1 mục lịch sử (FR-QL-12).
 *
 * Xoá `Activity` ⇒ `Evidence` bị cascade theo schema ⇒ tính lại level.
 */
export async function deleteLog(id: string): Promise<void> {
  const existing = await prisma.activity.findUnique({
    where: { id },
    select: { skillId: true },
  });

  if (!existing) throw new Error("log_not_found");

  await prisma.activity.delete({ where: { id } });

  if (existing.skillId) {
    await recalculateSkillLevels(existing.skillId);
  }
}

/**
 * Tiêu chí đủ để tạo Evidence (FR-SK-03).
 */
export function isEvidenceWorthy(difficulty: number | null): boolean {
  return difficulty !== null && difficulty >= EVIDENCE_RATING_MIN;
}

/** Số BC ≥3★ còn thiếu để lên 1 bậc — dùng cho UI tiêu chuẩn. */
export function missingForNextLevel(strongEvidenceCount: number): number {
  const required = (Math.floor(strongEvidenceCount / EVIDENCE_THRESHOLD) + 1) * EVIDENCE_THRESHOLD;
  return Math.max(0, required - strongEvidenceCount);
}

/** Khoá ngày (yyyy-MM-dd) cho lịch sử. */
export function logDateKey(date: Date): string {
  return toDateKey(date);
}
