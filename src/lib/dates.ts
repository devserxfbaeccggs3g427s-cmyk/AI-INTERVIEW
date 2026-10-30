/**
 * Chuẩn hoá ngày theo múi giờ LOCAL.
 *
 * ⚠️ TUYỆT ĐỐI không dùng `toISOString()` ở đây — nó chuyển sang UTC và làm
 * lệch ngày ở UTC+7 (ví dụ 00:30 ngày 31/10 → "2025-10-30T17:30:00Z").
 * Rủi ro T8 của `weekly-progress-report`.
 */

/** Trả về Date 00:00:00 local của ngày đã cho. */
export function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Khóa ngày dạng `yyyy-MM-dd` — so sánh ngày bằng so sánh chuỗi. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Khóa ngày hôm nay (local). */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** Trả về Date 00:00:00 local của ngày đã cho, dạng ISO cho Prisma. */
export function toLocalDateTime(date: Date): Date {
  return normalizeDate(date);
}

/** Cộng/trừ n ngày, giữ nguyên mốc 00:00 local. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return normalizeDate(result);
}

/** Số ngày giữa 2 mốc (theo ngày local, bỏ qua giờ). */
export function daysBetween(from: Date, to: Date): number {
  const ms = normalizeDate(to).getTime() - normalizeDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Ngày đầu tuần (Thứ 2) của tuần chứa `date`. */
export function startOfWeek(date: Date): Date {
  const normalized = normalizeDate(date);
  // getDay(): 0 = CN ... 6 = T7. ISO week bắt đầu T2.
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(normalized, diff);
}

/** Ngày cuối tuần (Chủ nhật) của tuần chứa `date`. */
export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

/** Ngày đầu tháng. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Ngày cuối tháng. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
