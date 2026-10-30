/**
 * Tầng dữ liệu chi phí AI (S15) — chạy **server-only**.
 *
 * Các hàm này truy vấn `AiCall` theo tháng và tính toán số liệu để hiển thị ở
 * tab Chi phí. Viết ở đây (chứ không phải trực tiếp trong component) để test
 * unit có thể import mà không cần React.
 *
 * Xem tasks.md 17.1–17.11 · design.md §6.8.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { TASK_LABELS, type AiTask } from "@/lib/ai/tasks";

/** Model 8 feature (FR-AI-07) — mỗi group gom 2 task liên quan. */
const FEATURE_GROUPS: Array<{ id: string; label: string; tasks: AiTask[] }> = [
  { id: "daily_plan", label: "Daily Plan Generation", tasks: ["daily_plan"] },
  { id: "grading", label: "Language Test & Grading", tasks: ["grading", "language_test_grade"] },
  { id: "journal", label: "Tư duy & Nhật ký", tasks: ["journal_feedback", "weekly_review"] },
  {
    id: "roleplay",
    label: "Communication & Writing",
    tasks: ["roleplay", "language_correct", "language_cards"],
  },
  { id: "interview", label: "Mock Interview", tasks: ["mock_interview", "mock_interview_turn", "mock_interview_report"] },
  {
    id: "autofill",
    label: "Quick-log autofill",
    tasks: ["autofill"],
  },
  {
    id: "language_level",
    label: "Đánh giá trình độ ngôn ngữ",
    tasks: ["language_level", "test_from_content"],
  },
  {
    id: "biometric",
    label: "Biometric Correlate",
    tasks: ["biometric_correlate", "mock_next_question", "classify"],
  },
];

/** Ánh xạ feature (AiTask) → nhóm của CostBar. */
const FEATURE_TO_GROUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const g of FEATURE_GROUPS) {
    for (const t of g.tasks) map[t] = g.id;
  }
  return map;
})();

/** Nhãn tiếng Việt của 1 nhóm (cho CostBar). */
export const FEATURE_GROUP_LABELS: Record<string, string> = {
  daily_plan: "Daily Plan",
  grading: "Đánh giá & Test",
  journal: "Nhật ký truyền thống",
  roleplay: "Giao tiếp & Writing",
  interview: "Mock Interview",
  autofill: "Quick-log autofill",
  language_level: "Ngôn ngữ",
  biometric: "Sinh trắc & Phân loại",
};

export type MonthKey = `${number}-${number}`; // "2026-10"

export type BudgetStatus = {
  budget: number;
  spent: number;
  percent: number;
  warning: boolean;
};

export type CacheStats = {
  totalCacheRead: number;
  hitRate: number;
  okCalls: number;
  fallbackCalls: number;
  avgLatencyMs: number;
};

export type CostAggregate = {
  totalCost: number;
  totalCalls: number;
  okCalls: number;
  fallbackCalls: number;
  cacheReads: number;
  cacheWrites: number;
  inputs: number;
  outputs: number;
};

export type CostByProvider = { provider: string; cost: number; calls: number };

export type CostByFeature = {
  id: string;
  label: string;
  cost: number;
  calls: number;
  percent: number;
  provider: string;
  model: string;
};

export type CostRow = {
  feature: string;
  provider: string;
  model: string;
  calls: number;
  cost: number;
  percent: number;
  fallbackFrom: string | null;
};

export type RecentCall = {
  id: string;
  feature: string;
  provider: string;
  model: string;
  ok: boolean;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  estimatedCost: number;
  latencyMs: number;
  fallbackFrom: string | null;
  createdAt: string;
};

export type TableData = {
  budget: BudgetStatus;
  cache: CacheStats;
  aggregate: CostAggregate;
  providers: CostByProvider[];
  features: CostByFeature[];
  rows: CostRow[];
  calls: RecentCall[];
  emergencyMode: boolean;
};

/** Chuyển Date → chuỗi ISO để truyền xuống client. */
function toISO(date: Date): string {
  return new Date(date).toISOString();
}

/** Chuỷển timestamp SQLite thành số mili-giây. */
function toMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  return Date.now();
}

/**
 * Tính chỉ số ngân sách trong tháng.
 *
 * `budget` từ `UserProfile.monthlyBudgetUsd` (null = chưa đặt).
 */
export async function getBudgetStatus(month: MonthKey): Promise<BudgetStatus> {
  const [profile, aiCalls] = await Promise.all([
    prisma.userProfile.findFirst({
      select: { monthlyBudgetUsd: true, emergencyMode: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aiCall.findMany({
      where: {
        createdAt: {
          gte: new Date(`${month}-01T00:00:00.000Z`),
          lte: new Date(`${month}-31T23:59:59.999Z`),
        },
      },
      select: { estimatedCost: true },
    }),
  ]);

  const budget = profile?.monthlyBudgetUsd ?? 0;
  const spent = aiCalls.reduce((sum, c) => sum + c.estimatedCost, 0);
  const percent = budget > 0 ? (spent / budget) * 100 : 0;
  return { budget, spent, percent, warning: percent >= 80 && percent < 100 };
}

/**
 * Tính chỉ số cache — `hitRate` = cacheRead / (cacheRead + inputTokens).
 *
 * Độ trễ TB được tính từ `createdAt` kế tiếp − trước (task 17.2).
 */
export async function getCacheStats(month: MonthKey): Promise<CacheStats> {
  const calls = await prisma.aiCall.findMany({
    where: {
      createdAt: {
        gte: new Date(`${month}-01T00:00:00.000Z`),
        lte: new Date(`${month}-31T23:59:59.999Z`),
      },
    },
    orderBy: { createdAt: "asc" },
    select: { cacheRead: true, inputTokens: true, ok: true, fallbackFrom: true, latencyMs: true, createdAt: true },
  });

  const totalCacheRead = calls.reduce((s, c) => s + c.cacheRead, 0);
  const totalInputs = calls.reduce((s, c) => s + c.inputTokens, 0);
  const hitRate = totalCacheRead + totalInputs > 0 ? (totalCacheRead / (totalCacheRead + totalInputs)) * 100 : 0;
  const okCalls = calls.filter((c) => c.ok).length;
  const fallbackCalls = calls.filter((c) => c.fallbackFrom !== null).length;

  // Latency TB từ createdAt kế tiếp − trước.
  let totalLatency = 0;
  let intervalCount = 0;
  for (let i = 1; i < calls.length; i++) {
    const prevCall = calls[i - 1];
    const currCall = calls[i];
    if (!prevCall || !currCall) continue;
    const prev = toMs(prevCall.createdAt);
    const curr = toMs(currCall.createdAt);
    const delta = curr - prev;
    if (delta > 0) {
      totalLatency += delta;
      intervalCount += 1;
    }
  }
  const avgLatencyMs = intervalCount > 0 ? totalLatency / intervalCount : 0;

  return { totalCacheRead, hitRate, okCalls, fallbackCalls, avgLatencyMs };
}

/** Tổng hợp chi phí theo provider / feature trong tháng. */
export async function getAggregateData(month: MonthKey): Promise<{
  aggregate: CostAggregate;
  providers: CostByProvider[];
  features: CostByFeature[];
}> {
  const calls = await prisma.aiCall.findMany({
    where: {
      createdAt: {
        gte: new Date(`${month}-01T00:00:00.000Z`),
        lte: new Date(`${month}-31T23:59:59.999Z`),
      },
    },
    select: {
      feature: true,
      provider: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      cacheWrite: true,
      estimatedCost: true,
      ok: true,
      fallbackFrom: true,
    },
  });

  const aggregate: CostAggregate = {
    totalCost: calls.reduce((s, c) => s + c.estimatedCost, 0),
    totalCalls: calls.length,
    okCalls: calls.filter((c) => c.ok).length,
    fallbackCalls: calls.filter((c) => c.fallbackFrom !== null).length,
    cacheReads: calls.reduce((s, c) => s + c.cacheRead, 0),
    cacheWrites: calls.reduce((s, c) => s + c.cacheWrite, 0),
    inputs: calls.reduce((s, c) => s + c.inputTokens, 0),
    outputs: calls.reduce((s, c) => s + c.outputTokens, 0),
  };

  // Theo provider — tách "local" riêng khỏi provider thực (17.3).
  const providerMap = new Map<string, { cost: number; calls: number }>();
  for (const c of calls) {
    const key = c.provider;
    const existing = providerMap.get(key) ?? { cost: 0, calls: 0 };
    existing.cost += c.estimatedCost;
    existing.calls += 1;
    providerMap.set(key, existing);
  }
  const providers: CostByProvider[] = [...providerMap.entries()].map(([provider, v]) => ({
    provider,
    cost: v.cost,
    calls: v.calls,
  }));

  // Theo feature group — dùng TASK_LABELS để đặt tên.
  const featureMap = new Map<string, { cost: number; calls: number; provider: string; model: string }>();
  for (const c of calls) {
    const group = FEATURE_TO_GROUP[c.feature] ?? c.feature;
    const existing = featureMap.get(group) ?? { cost: 0, calls: 0, provider: c.provider, model: c.model };
    existing.cost += c.estimatedCost;
    existing.calls += 1;
    // Lưu provider/model đầu tiên gặp.
    existing.provider ||= c.provider;
    existing.model ||= c.model;
    featureMap.set(group, existing);
  }
  const totalCost = aggregate.totalCost;
  const features: CostByFeature[] = [...featureMap.entries()].map(([id, v]) => ({
    id,
    label: FEATURE_GROUP_LABELS[id] ?? TASK_LABELS[id as AiTask] ?? id,
    cost: v.cost,
    calls: v.calls,
    percent: totalCost > 0 ? (v.cost / totalCost) * 100 : 0,
    provider: v.provider,
    model: v.model,
  }));

  return { aggregate, providers, features };
}

/**
 * Bảng chi tiết — mỗi hàng là 1 (provider, model) kết hợp với tổng số lượt + chi phí.
 *
 * Cột `fallbackFrom` = provider gốc bị lỗi (task 17.4).
 */
export async function getCostRows(month: MonthKey): Promise<CostRow[]> {
  const rows = await prisma.aiCall.groupBy({
    by: ["feature", "provider", "model", "fallbackFrom"],
    where: {
      createdAt: {
        gte: new Date(`${month}-01T00:00:00.000Z`),
        lte: new Date(`${month}-31T23:59:59.999Z`),
      },
    },
    _sum: { estimatedCost: true },
    _count: true,
  });

  const totalCost = rows.reduce((s, r) => s + (r._sum.estimatedCost ?? 0), 0);
  return rows.map((r) => ({
    feature: r.feature,
    provider: r.provider,
    model: r.model,
    calls: Number(r._count),
    cost: r._sum.estimatedCost ?? 0,
    percent: totalCost > 0 ? ((r._sum.estimatedCost ?? 0) / totalCost) * 100 : 0,
    fallbackFrom: r.fallbackFrom ?? null,
  }));
}

/** 20 lượt gọi API gần nhất — cho bảng nhật ký. */
export async function getRecentCalls(limit = 20): Promise<RecentCall[]> {
  const calls = await prisma.aiCall.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      feature: true,
      provider: true,
      model: true,
      ok: true,
      error: true,
      inputTokens: true,
      outputTokens: true,
      cacheRead: true,
      estimatedCost: true,
      latencyMs: true,
      fallbackFrom: true,
      createdAt: true,
    },
  });
  return calls.map((c) => ({
    ...c,
    createdAt: toISO(c.createdAt),
  }));
}

/** Đọc cờ emergency mode từ UserProfile. */
export async function getEmergencyMode(): Promise<boolean> {
  const profile = await prisma.userProfile.findFirst({
    select: { emergencyMode: true },
    orderBy: { createdAt: "asc" },
  });
  return profile?.emergencyMode ?? false;
}

/** Gộp toàn bộ dữ liệu — truyền xuống CostTab một lần. */
export async function getCostData(month: MonthKey): Promise<TableData> {
  const [budget, cache, agg, rows, calls, emergency] = await Promise.all([
    getBudgetStatus(month),
    getCacheStats(month),
    getAggregateData(month),
    getCostRows(month),
    getRecentCalls(),
    getEmergencyMode(),
  ]);
  return { budget, cache, aggregate: agg.aggregate, providers: agg.providers, features: agg.features, rows, calls, emergencyMode: emergency };
}
