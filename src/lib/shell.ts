/**
 * Dữ liệu cho shell (Topbar + Sidebar).
 *
 * Tách riêng khỏi component để `AppShell` (client) không phải import Prisma.
 * Layout gốc gọi các hàm này ở server rồi truyền xuống.
 */

import { prisma } from "@/lib/db";
import { addDays, startOfDay, startOfWeek } from "@/lib/dates";
import { SLOT_COUNT } from "@/lib/types";

export type ShellData = {
  /** Chuỗi ngày liên tiếp có hoàn thành ít nhất 1 hành động. */
  streak: number;
  /** Năng lượng tuần 0–100 — tỷ lệ slot đã xong trong 7 ngày gần nhất. */
  weekEnergy: number;
  /** Nhãn chip AI — phản ánh provider THẬT đã trả lời (FR-AI-11). */
  aiChip: string;
  /** Có lượt gọi local nào không (dùng cho màu chip). */
  aiIsLocal: boolean;
};

/**
 * Tính streak: đếm ngày liên tiếp gần nhất có ít nhất 1 slot `done`.
 * Hôm nay chưa làm gì vẫn giữ streak của hôm qua (streak chỉ reset khi trượt
 * trọn 1 ngày đã qua).
 */
export async function computeStreak(now: Date = new Date()): Promise<number> {
  const today = startOfDay(now);
  const since = addDays(today, -60);

  const done = await prisma.planItem.findMany({
    where: { done: true, date: { gte: since, lte: today } },
    select: { date: true },
    distinct: ["date"],
  });

  const days = new Set(done.map((d) => new Date(d.date).toDateString()));
  if (days.size === 0) return 0;

  let streak = 0;
  // Nếu hôm nay chưa có hành động nào, streak tính từ hôm qua.
  let cursor = days.has(today.toDateString()) ? today : addDays(today, -1);

  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * Năng lượng tuần 0–100 = tỷ lệ slot đã xong trong 7 ngày gần nhất.
 * Tối đa `SLOT_COUNT * 7` slot nếu mỗi ngày đủ 6 slot.
 */
export async function computeWeekEnergy(now: Date = new Date()): Promise<number> {
  const today = startOfDay(now);
  const from = addDays(today, -6);
  const weekStart = startOfWeek(today);

  const [doneCount, totalCount] = await Promise.all([
    prisma.planItem.count({
      where: { done: true, date: { gte: from, lte: today } },
    }),
    prisma.planItem.count({
      where: { date: { gte: from, lte: today } },
    }),
  ]);

  if (totalCount === 0) return 0;
  return Math.min(100, Math.round((doneCount / totalCount) * 100));
}

/**
 * Trạng thái provider AI cho chip header.
 *
 * Ưu tiên lần gọi gần nhất đã ghi trong `AiCall`; nếu chưa có lần gọi nào thì
 * suy ra từ cấu hình: có `ANTHROPIC_API_KEY` → cloud, không → local.
 */
export async function computeAiStatus(): Promise<{ aiChip: string; aiIsLocal: boolean }> {
  const last = await prisma.aiCall.findFirst({
    orderBy: { createdAt: "desc" },
    select: { provider: true, model: true },
  });

  if (last) {
    if (last.provider === "local") {
      return { aiChip: "AI Offline / Local (Ollama)", aiIsLocal: true };
    }
    if (last.model.startsWith("claude-haiku")) {
      return { aiChip: "AI Online / Cloud (Claude Haiku 4.5)", aiIsLocal: false };
    }
    return { aiChip: "AI Online / Cloud (Claude Opus 5)", aiIsLocal: false };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return { aiChip: "AI Online / Cloud (Claude Opus 5)", aiIsLocal: false };
  }
  return { aiChip: "AI Offline / Local (Ollama)", aiIsLocal: true };
}

/** Gom toàn bộ dữ liệu shell trong 1 lần gọi. */
export async function getShellData(now: Date = new Date()): Promise<ShellData> {
  const [streak, weekEnergy, ai] = await Promise.all([
    computeStreak(now),
    computeWeekEnergy(now),
    computeAiStatus(),
  ]);

  return {
    streak,
    weekEnergy,
    aiChip: ai.aiChip,
    aiIsLocal: ai.aiIsLocal,
  };
}
