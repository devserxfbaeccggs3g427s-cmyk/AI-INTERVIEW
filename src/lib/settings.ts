import { prisma } from "@/lib/db";
import { toDateKey } from "@/lib/dates";

/**
 * Lớp nghiệp vụ Cài đặt & Chi phí (S15) — FR-SC-01..29.
 *
 * ⚠️ P6 / FR-SC-25 — mọi thao tác xoá dữ liệu cần xác nhận **2 bước**:
 * bước 1 mở hộp thoại, bước 2 gõ đúng `XOA`.
 *
 * ⚠️ FR-SC-24 — xuất JSON chứa **toàn bộ** bảng + hồ sơ + metadata.
 */

/* ══ Hồ sơ người dùng (FR-SC-01..07) ════════════════════════════════════ */

export type AiTone = "direct" | "coach" | "gentle";
export type LanguageStandard = "cefr" | "hsk" | "both";

/** Thang CEFR đầy đủ (FR-SC-05). */
export const CEFR_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

/** Thang HSK đầy đủ (FR-SC-05). */
export const HSK_LEVELS = ["zero", "1", "2", "3", "4", "5", "6"] as const;

export type LanguageCode = "en" | "zh" | "vi";

/**
 * Ngôn ngữ phỏng vấn.
 *
 * ⚠️ Task 35.7 — nhận `zh` ngoài `en`/`vi` (Q2 trong OPEN-QUESTIONS đã chốt:
 * người dùng học 3 ngôn ngữ, phỏng vấn có thể bằng cả 3).
 */
export type InterviewLang = "en" | "zh" | "vi";

export interface UserProfileDTO {
  name: string | null;
  goals: string | null;
  aiTone: AiTone;
  learningLangs: LanguageCode[];
  zhLevel: string;
  enLevel: string;
  viLevel: string;
  languageStandard: LanguageStandard;
  interviewLang: InterviewLang;
  monthlyBudgetUsd: number;
  saverMode: boolean;
  focusSkillId: string | null;
}

/**
 * Đọc hồ sơ (FR-SC-01..07).
 *
 * Nếu chưa có hồ sơ ⇒ trả mặc định, KHÔNG tự tạo (để `POST` quyết định).
 */
export async function getUserProfile(): Promise<UserProfileDTO> {
  const row = await prisma.userProfile.findFirst({ orderBy: { createdAt: "asc" } });

  if (!row) {
    return {
      name: null,
      goals: null,
      aiTone: "direct",
      learningLangs: ["zh", "en"],
      zhLevel: "zero",
      enLevel: "zero",
      viLevel: "B2",
      languageStandard: "cefr",
      interviewLang: "en",
      monthlyBudgetUsd: 15,
      saverMode: false,
      focusSkillId: null,
    };
  }

  return {
    name: row.name,
    goals: row.goals,
    aiTone: (row.aiTone as AiTone) ?? "direct",
    learningLangs: parseLangs(row.learningLangs),
    zhLevel: row.zhLevel,
    enLevel: row.enLevel,
    viLevel: row.viLevel,
    languageStandard: (row.languageStandard as LanguageStandard) ?? "cefr",
    interviewLang: (row.interviewLang as InterviewLang) ?? "en",
    monthlyBudgetUsd: row.monthlyBudgetUsd,
    saverMode: row.saverMode,
    focusSkillId: row.focusSkillId,
  };
}

/**
 * Lưu hồ sơ (FR-SC-01..07).
 *
 * ⚠️ FR-SC-04 — phải còn **≥ 1 ngôn ngữ** đang học.
 * ⚠️ FR-SC-07 — upsert, không mất dữ liệu đang gõ khi lỗi.
 */
export async function saveUserProfile(input: {
  name?: string | null;
  goals?: string | null;
  aiTone?: AiTone;
  learningLangs?: LanguageCode[];
  zhLevel?: string;
  enLevel?: string;
  viLevel?: string;
  languageStandard?: LanguageStandard;
  interviewLang?: InterviewLang;
  monthlyBudgetUsd?: number;
  saverMode?: boolean;
}): Promise<UserProfileDTO> {
  // ⚠️ FR-SC-04 — ≥ 1 ngôn ngữ đang học.
  if (input.learningLangs !== undefined && input.learningLangs.length === 0) {
    throw new Error("no_learning_lang");
  }

  // ⚠️ FR-SC-01 — tối đa 80 ký tự.
  if (input.name !== undefined && input.name !== null && input.name.length > 80) {
    throw new Error("name_too_long");
  }

  // ⚠️ FR-SC-02 — tối đa 2000 ký tự.
  if (input.goals !== undefined && input.goals !== null && input.goals.length > 2000) {
    throw new Error("goals_too_long");
  }

  // ⚠️ FR-SC-22 — ngân sách phải ≥ 0.
  if (
    input.monthlyBudgetUsd !== undefined &&
    (!Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd < 0)
  ) {
    throw new Error("invalid_budget");
  }

  const existing = await prisma.userProfile.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const data = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.goals !== undefined ? { goals: input.goals } : {}),
    ...(input.aiTone !== undefined ? { aiTone: input.aiTone } : {}),
    ...(input.learningLangs !== undefined
      ? { learningLangs: input.learningLangs.join(",") }
      : {}),
    ...(input.zhLevel !== undefined ? { zhLevel: input.zhLevel } : {}),
    ...(input.enLevel !== undefined ? { enLevel: input.enLevel } : {}),
    ...(input.viLevel !== undefined ? { viLevel: input.viLevel } : {}),
    ...(input.languageStandard !== undefined
      ? { languageStandard: input.languageStandard }
      : {}),
    ...(input.interviewLang !== undefined
      ? { interviewLang: input.interviewLang }
      : {}),
    ...(input.monthlyBudgetUsd !== undefined
      ? { monthlyBudgetUsd: input.monthlyBudgetUsd }
      : {}),
    ...(input.saverMode !== undefined ? { saverMode: input.saverMode } : {}),
  };

  if (existing) {
    await prisma.userProfile.update({ where: { id: existing.id }, data });
  } else {
    await prisma.userProfile.create({ data });
  }

  return getUserProfile();
}

/** Parse chuỗi `learningLangs` — luôn ≥ 1 ngôn ngữ. */
function parseLangs(raw: string): LanguageCode[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is LanguageCode =>
      part === "en" || part === "zh" || part === "vi",
    );

  return parts.length > 0 ? parts : ["zh", "en"];
}

/* ══ Chi phí AI (FR-SC-15..23) ══════════════════════════════════════════ */

export interface DailyCost {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
}

export interface FeatureCost {
  feature: string;
  model: string;
  calls: number;
  estimatedCost: number;
  /** % tổng chi phí (0–100). */
  share: number;
}

export interface CostSummary {
  days: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
  daily: DailyCost[];
  byFeature: FeatureCost[];
  /** Ngân sách tháng (USD). */
  monthlyBudgetUsd: number;
  /** Chi phí tháng hiện tại (USD). */
  monthCost: number;
  /** Mức cảnh báo: `ok` | `warning` (≥80%) | `exceeded` (≥100%). */
  budgetStatus: "ok" | "warning" | "exceeded";
  /** % ngân sách đã dùng (có thể > 100). */
  budgetUsedPct: number;
}

/**
 * Tính chi phí theo ngày + theo tính năng (FR-SC-15..19, FR-SC-23).
 *
 * ⚠️ FR-SC-18 — **ước tính** theo bảng giá model. Không có vanity metric.
 */
export async function getCostSummary(days: number): Promise<CostSummary> {
  const windowDays = [7, 30, 90].includes(days) ? days : 30;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (windowDays - 1));

  const calls = await prisma.aiCall.findMany({
    where: { createdAt: { gte: since } },
    select: {
      feature: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      cacheWrite: true,
      estimatedCost: true,
      createdAt: true,
    },
  });

  // Theo ngày.
  const dailyMap = new Map<string, DailyCost>();
  for (const call of calls) {
    const key = toDateKey(call.createdAt);
    const bucket =
      dailyMap.get(key) ??
      {
        date: key,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
      };

    bucket.calls += 1;
    bucket.inputTokens += call.inputTokens;
    bucket.outputTokens += call.outputTokens;
    bucket.cacheRead += call.cacheRead;
    bucket.cacheWrite += call.cacheWrite;
    bucket.estimatedCost += call.estimatedCost;
    dailyMap.set(key, bucket);
  }

  // Đủ N ngày (ngày không có call vẫn hiện 0 — biểu đồ cần đều nhịp).
  const daily: DailyCost[] = [];
  for (let index = 0; index < windowDays; index++) {
    const day = new Date(since);
    day.setDate(day.getDate() + index);
    const key = toDateKey(day);
    daily.push(
      dailyMap.get(key) ?? {
        date: key,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
      },
    );
  }

  // Theo tính năng + model.
  const featureMap = new Map<string, FeatureCost>();
  for (const call of calls) {
    const key = `${call.feature}|${call.model}`;
    const bucket =
      featureMap.get(key) ??
      { feature: call.feature, model: call.model, calls: 0, estimatedCost: 0, share: 0 };
    bucket.calls += 1;
    bucket.estimatedCost += call.estimatedCost;
    featureMap.set(key, bucket);
  }

  const totalCost = calls.reduce((sum, call) => sum + call.estimatedCost, 0);

  const byFeature = [...featureMap.values()]
    .map((bucket) => ({
      ...bucket,
      share: totalCost > 0 ? (bucket.estimatedCost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);

  // Chi phí tháng hiện tại.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthCalls = await prisma.aiCall.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { estimatedCost: true },
  });
  const monthCost = monthCalls._sum.estimatedCost ?? 0;

  const profile = await getUserProfile();
  const budget = profile.monthlyBudgetUsd;
  const budgetUsedPct = budget > 0 ? (monthCost / budget) * 100 : 0;

  const budgetStatus: CostSummary["budgetStatus"] =
    budgetUsedPct >= 100 ? "exceeded" : budgetUsedPct >= 80 ? "warning" : "ok";

  return {
    days: windowDays,
    totalCalls: calls.length,
    inputTokens: calls.reduce((sum, c) => sum + c.inputTokens, 0),
    outputTokens: calls.reduce((sum, c) => sum + c.outputTokens, 0),
    cacheRead: calls.reduce((sum, c) => sum + c.cacheRead, 0),
    cacheWrite: calls.reduce((sum, c) => sum + c.cacheWrite, 0),
    estimatedCost: totalCost,
    daily,
    byFeature,
    monthlyBudgetUsd: budget,
    monthCost,
    budgetStatus,
    budgetUsedPct: Number(budgetUsedPct.toFixed(1)),
  };
}

/**
 * Nhật ký gọi API gần nhất (FR-SC-19..20).
 */
export async function listAiCalls(
  limit = 100,
): Promise<
  Array<{
    id: string;
    createdAt: string;
    feature: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
    cacheWrite: number;
    estimatedCost: number;
    ok: boolean;
    error: string | null;
    dataPreview: string | null;
  }>
> {
  const rows = await prisma.aiCall.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(1, limit)),
    select: {
      id: true,
      createdAt: true,
      feature: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      cacheWrite: true,
      estimatedCost: true,
      ok: true,
      error: true,
      dataPreview: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    feature: row.feature,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheRead: row.cacheRead,
    cacheWrite: row.cacheWrite,
    estimatedCost: row.estimatedCost,
    ok: row.ok,
    error: row.error,
    dataPreview: row.dataPreview,
  }));
}

/**
 * Xuất `AiCall` ra CSV (FR-SC-21) — UTF-8, cột tiếng Việt.
 */
export async function exportAiCallsCsv(limit = 500): Promise<string> {
  const rows = await listAiCalls(limit);

  const header = [
    "Thời gian",
    "Tính năng",
    "Mô hình",
    "Input token",
    "Output token",
    "Cache read",
    "Cache write",
    "Chi phí USD",
    "Thành công",
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.createdAt,
        row.feature,
        row.model,
        String(row.inputTokens),
        String(row.outputTokens),
        String(row.cacheRead),
        String(row.cacheWrite),
        row.estimatedCost.toFixed(6),
        row.ok ? "Có" : "Không",
      ]
        .map((cell) => `"${cell.replace(/"/g, '""')}"`)
        .join(","),
    );
  }

  return lines.join("\n");
}

/* ══ Dữ liệu đã gửi lên (FR-SC-27) ═══════════════════════════════════════ */

export interface PrivacyLogEntry {
  id: string;
  createdAt: string;
  feature: string;
  model: string;
  /** Loại dữ liệu đã gửi — JSON array (C12). */
  dataKinds: string[];
  dataPreview: string | null;
  estimatedCost: number;
}

/**
 * Nhật ký "dữ liệu nào đã gửi lên API" (FR-SC-27).
 */
export async function listPrivacyLog(
  limit = 100,
): Promise<PrivacyLogEntry[]> {
  const rows = await prisma.aiCall.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(1, limit)),
    select: {
      id: true,
      createdAt: true,
      feature: true,
      model: true,
      dataKinds: true,
      dataPreview: true,
      estimatedCost: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    feature: row.feature,
    model: row.model,
    dataKinds: parseDataKinds(row.dataKinds),
    dataPreview: row.dataPreview,
    estimatedCost: row.estimatedCost,
  }));
}

/** Parse `dataKinds` (JSON array) — trả `[]` nếu lỗi. */
function parseDataKinds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/* ══ Thống kê & xuất dữ liệu (FR-SC-24..26) ═════════════════════════════ */

/** Số bản ghi từng bảng + dung lượng DB (FR-SC-26). */
export async function getDataStats(): Promise<{
  dbSizeBytes: number;
  tables: Array<{ name: string; rows: number }>;
}> {
  const counts = await Promise.all([
    prisma.activity.count(),
    prisma.evidence.count(),
    prisma.skill.count(),
    prisma.card.count(),
    prisma.planItem.count(),
    prisma.reflection.count(),
    prisma.dailyState.count(),
    prisma.aiCall.count(),
    prisma.userProfile.count(),
  ]);

  const names = [
    "Activity",
    "Evidence",
    "Skill",
    "Card",
    "PlanItem",
    "Reflection",
    "DailyState",
    "AiCall",
    "UserProfile",
  ];

  // Kích thước file SQLite — đọc từ đường dẫn `DATABASE_URL`.
  const dbPath = resolveDbPath();
  let dbSizeBytes = 0;
  if (dbPath) {
    try {
      const { statSync } = await import("node:fs");
      dbSizeBytes = statSync(dbPath).size;
    } catch {
      dbSizeBytes = 0;
    }
  }

  return {
    dbSizeBytes,
    tables: names.map((name, index) => ({ name, rows: counts[index] })),
  };
}

/** Suy ra đường dẫn file SQLite từ `DATABASE_URL`. */
function resolveDbPath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const match = /^file:(.+)$/.exec(url);
  if (!match) return null;

  const raw = match[1];
  return raw.startsWith("/") ? raw : `${process.cwd()}/prisma/${raw}`;
}

/**
 * Xuất toàn bộ cơ sở dữ liệu ra JSON (FR-SC-24).
 *
 * ⚠️ Chứa metadata: `schemaVersion`, `exportedAt`, `appVersion`.
 */
export async function exportAllData(): Promise<{
  metadata: {
    schemaVersion: number;
    exportedAt: string;
    appVersion: string;
  };
  data: Record<string, unknown>;
}> {
  const [
    activities,
    evidences,
    skills,
    cards,
    planItems,
    reflections,
    dailyStates,
    aiCalls,
    profiles,
  ] = await Promise.all([
    prisma.activity.findMany(),
    prisma.evidence.findMany(),
    prisma.skill.findMany(),
    prisma.card.findMany(),
    prisma.planItem.findMany(),
    prisma.reflection.findMany(),
    prisma.dailyState.findMany(),
    prisma.aiCall.findMany(),
    prisma.userProfile.findMany(),
  ]);

  return {
    metadata: {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: "0.1.0",
    },
    data: {
      activities,
      evidences,
      skills,
      cards,
      planItems,
      reflections,
      dailyStates,
      aiCalls,
      profiles,
    },
  };
}

/**
 * Xoá trắng dữ liệu (FR-SC-25).
 *
 * ⚠️ FR-SC-25 — xác nhận 2 bước: bước 2 phải gõ đúng `XOA`.
 *
 * ⚠️ KHÔNG xoá `Skill` và `Card` (seed lõi — cây kỹ năng & bộ thẻ gốc),
 * chỉ xoá dữ liệu người dùng sinh ra.
 */
export async function wipeUserData(): Promise<{
  deleted: Record<string, number>;
}> {
  // Thứ tự: con trước cha (cascade tự xử lý nhưng rõ ràng hơn).
  const evidences = await prisma.evidence.deleteMany();
  const aiCalls = await prisma.aiCall.deleteMany();
  const reflections = await prisma.reflection.deleteMany();
  const activities = await prisma.activity.deleteMany();
  const planItems = await prisma.planItem.deleteMany();
  const dailyStates = await prisma.dailyState.deleteMany();

  return {
    deleted: {
      Evidence: evidences.count,
      AiCall: aiCalls.count,
      Reflection: reflections.count,
      Activity: activities.count,
      PlanItem: planItems.count,
      DailyState: dailyStates.count,
    },
  };
}

/**
 * Kiểm tra xác nhận 2 bước (FR-SC-25).
 *
 * @param confirmation — chuỗi người dùng gõ; phải đúng `XOA`.
 */
export function isValidWipeConfirmation(confirmation: string): boolean {
  return confirmation.trim() === "XOA";
}
