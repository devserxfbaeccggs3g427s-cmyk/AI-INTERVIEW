/**
 * Module tuần (ISO week) — tuần bắt đầu Thứ Hai 00:00 local.
 *
 * ⚠️ T8: KHÔNG dùng `toISOString()` để so sánh ngày — nó chuyển sang UTC và
 * lệch ngày ở UTC+7. Mọi so sánh dùng `Date` local qua `src/lib/dates.ts`.
 *
 * Nguồn: `.kiro/specs/weekly-progress-report/spec.md` §5 + design.md §4.1.
 */

import { addDays, normalizeDate, toDateKey } from "@/lib/dates";

export interface IsoWeekRange {
  week: string;
  /** Thứ Hai 00:00 local. */
  start: Date;
  /** Chủ Nhật 23:59:59.999 local (exclusive end = start + 7 ngày). */
  end: Date;
  /** Ngày trong tuần (7 ngày, Thứ Hai → Chủ Nhật). */
  days: Date[];
}

/** Regex tuần ISO: `2026-W43`. */
const ISO_WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

/** Chuẩn hoá week string về dạng `yyyy-Www` (2 chữ số). */
export function normalizeIsoWeek(week: string): string {
  const match = ISO_WEEK_PATTERN.exec(week.trim());
  if (!match) return week.trim();
  return `${match[1]}-W${match[2].padStart(2, "0")}`;
}

/** Tuần ISO có hợp lệ không (`2026-W01`..`2026-W53`). */
export function isValidIsoWeek(week: string): boolean {
  const match = ISO_WEEK_PATTERN.exec(week.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  if (weekNumber < 1 || weekNumber > 53) return false;

  // Tuần 53 chỉ tồn tại ở năm có 53 tuần ISO.
  return weekNumber <= isoWeeksInYear(year);
}

/** Số tuần ISO trong 1 năm (52 hoặc 53). */
export function isoWeeksInYear(year: number): number {
  // 1 tháng 1 là Thứ Năm ⇒ năm có 53 tuần khi 1/1 là Thứ Năm hoặc Thứ Tư.
  const jan1 = new Date(year, 0, 1);
  const day = jan1.getDay(); // 0 = CN
  const isoDay = day === 0 ? 7 : day; // 1 = T2 … 7 = CN
  return isoDay === 4 || isoDay === 3 ? 53 : 52;
}

/** Ngày Thứ Hai 00:00 local của tuần ISO chứa `date`. */
export function startOfIsoWeek(date: Date): Date {
  const normalized = normalizeDate(date);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(normalized, diff);
}

/**
 * Tuần ISO chứa `date` — dạng `yyyy-Www`.
 *
 * ⚠️ Tuần ISO có 4 ngày thuộc tuần trước ⇒ tính theo quy tắc ISO chuẩn:
 * ngày thuộc tuần `W` nếu nó ≥ Thứ Hai của tuần đó và < Thứ Hai của tuần sau.
 */
export function toIsoWeek(date: Date): string {
  const thursday = addDays(startOfIsoWeek(date), 3);
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const firstThursday = addDays(startOfIsoWeek(jan1), 3);
  const week = Math.floor(
    (thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000),
  ) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Tuần ISO hiện tại. */
export function currentIsoWeek(now: Date = new Date()): string {
  return toIsoWeek(now);
}

/** Tuần ISO trước `week`. */
export function previousIsoWeek(week: string): string {
  const range = parseIsoWeek(week);
  if (!range) return week;
  return toIsoWeek(addDays(range.start, -7));
}

/**
 * Parse `yyyy-Www` ⇒ khoảng tuần (Thứ Hai 00:00 → Chủ Nhật 23:59:59.999).
 *
 * Trả `null` nếu tuần không hợp lệ.
 */
export function parseIsoWeek(week: string): IsoWeekRange | null {
  if (!isValidIsoWeek(week)) return null;

  const normalized = normalizeIsoWeek(week);
  const match = ISO_WEEK_PATTERN.exec(normalized);
  if (!match) return null;

  const year = Number(match[1]);
  const weekNumber = Number(match[2]);

  // 4 tháng 1 (hoặc 29/12 của năm trước) luôn thuộc tuần 1.
  const jan4 = new Date(year, 0, 4);
  const firstMonday = startOfIsoWeek(jan4);
  const start = addDays(firstMonday, (weekNumber - 1) * 7);

  const days: Date[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(addDays(start, i));
  }

  return {
    week: normalized,
    start,
    end: addDays(start, 7),
    days,
  };
}

/** 7 ngày của tuần (Thứ Hai → Chủ Nhật). */
export function weekDays(week: string): Date[] {
  return parseIsoWeek(week)?.days ?? [];
}

/**
 * Báo cáo tuần có đến hạn chưa — Chủ Nhật từ 20:00 local (FR-WR-01).
 */
export function isWeeklyReviewDue(now: Date = new Date()): boolean {
  const normalized = normalizeDate(now);
  // getDay(): 0 = CN.
  if (normalized.getDay() !== 0) return false;
  return now.getHours() >= 20;
}

/**
 * Tuần gần nhất **đã chốt** — tuần trước nếu chưa tới Chủ Nhật 20:00.
 */
export function lastCompletedWeek(now: Date = new Date()): string {
  const current = currentIsoWeek(now);
  if (isWeeklyReviewDue(now)) return current;
  return previousIsoWeek(current);
}

/** Nhãn tuần dễ đọc: "Tuần 43 (23/10 – 29/10/2026)". */
export function formatWeekLabel(week: string): string {
  const range = parseIsoWeek(week);
  if (!range) return week;

  const start = range.start;
  const end = addDays(range.start, 6);
  return `Tuần ${range.week.split("-W")[1]} (${formatShortDate(start)} – ${formatShortDate(end)})`;
}

function formatShortDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** Khóa ngày của tuần — `yyyy-MM-dd`. */
export function weekDateKeys(week: string): string[] {
  return weekDays(week).map((day) => toDateKey(day));
}
