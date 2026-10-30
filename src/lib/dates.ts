/**
 * Utility ngày giờ — chuẩn hoá theo **giờ local** của máy người dùng.
 *
 * Không dùng `toISOString()` để lấy ngày: hàm đó chuyển sang UTC và có thể lệch
 * ngày (ví dụ 23:30 giờ VN → 16:30 UTC → ngày hôm trước).
 *
 * Xem tasks.md 1.10 · design.md §2.1 (`src/lib/dates.ts`).
 */

export const VN_TZ = "Asia/Ho_Chi_Minh";

const WEEKDAY_VI = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

/** Chữ cái đầu của thứ để dựng nhãn cột ngắn: T2 · T3 · T4 · T5 · T6 · T7 · CN */
export const WEEKDAY_SHORT_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/**
 * Chuẩn hoá một Date về 00:00:00.000 **giờ local**.
 * Mọi `PlanItem.date` và `DailyState.date` đều dùng hàm này để `date` là duy nhất.
 */
export function startOfDay(input: Date | string | number = new Date()): Date {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ngày hôm nay theo giờ local, đã chuẩn hoá 00:00. */
export function todayKey(input: Date | string | number = new Date()): Date {
  return startOfDay(input);
}

/** Key dạng `YYYY-MM-DD` theo giờ local — dùng để so sánh nhanh. */
export function dateKey(input: Date | string | number = new Date()): string {
  const d = startOfDay(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Thêm `n` ngày (giờ local). */
export function addDays(input: Date, n: number): Date {
  const d = new Date(input.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Tuần ISO — tuần bắt đầu **thứ Hai** và kết thúc chủ nhật.
 * `startOfWeek` trả về 00:00 thứ Hai của tuần chứa `input`.
 */
export function startOfWeek(input: Date | string | number = new Date()): Date {
  const d = startOfDay(input);
  const day = d.getDay(); // 0 = Chủ Nhật … 6 = Thứ Bảy
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** Tuần ISO hiện tại: { start, end } — end là Chủ Nhật 23:59:59.999 */
export function currentWeek(input: Date | string | number = new Date()): {
  start: Date;
  end: Date;
} {
  const start = startOfWeek(input);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Nhãn ngày kiểu "Thứ Tư 29/10" — dùng ở chip ngày trên Topbar (S01). */
export function formatVnDate(input: Date | string | number = new Date()): string {
  const d = startOfDay(input);
  return `${WEEKDAY_VI[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Nhãn ngày dài: "Thứ Tư, 29 tháng 10, 2026" */
export function formatVnDateLong(input: Date | string | number = new Date()): string {
  const d = startOfDay(input);
  return `${WEEKDAY_VI[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

/** Nhãn ngắn 2 chữ cho cột ngày: "T4" */
export function weekdayShort(input: Date | string | number = new Date()): string {
  return WEEKDAY_SHORT_VI[startOfDay(input).getDay()] ?? "T4";
}

/**
 * 7 ngày gần nhất tính từ `end` (mặc định hôm nay), theo thứ tự T2 → CN.
 * Dùng cho `WeekStreak` (S01) và `StateDots` (S12).
 */
export function lastNWeekdays(end: Date = new Date(), n: number = 7): Date[] {
  const weekStart = startOfWeek(end);
  const out: Date[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(addDays(weekStart, i));
  }
  return out;
}

/** Nhãn thời gian tương đối: "2 giờ trước", "3 ngày trước" — dùng ở EvidenceFeed. */
export function relativeTime(input: Date | string | number, now: Date = new Date()): string {
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  const diffMs = now.getTime() - t;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  return `${months} tháng trước`;
}

/** Khoảng cách giữa 2 ngày theo số ngày lịch (dùng để tính streak). */
export function daysBetween(a: Date, b: Date): number {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Cùng ngày lịch hay không. */
export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
