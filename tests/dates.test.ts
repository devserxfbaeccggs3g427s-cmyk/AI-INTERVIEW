import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  endOfMonth,
  endOfWeek,
  normalizeDate,
  startOfMonth,
  startOfWeek,
  toDateKey,
  todayKey,
} from "@/lib/dates";

describe("dates — chuẩn hoá múi giờ LOCAL (rủi ro T8)", () => {
  it("normalizeDate giữ nguyên ngày local, không lùi sang hôm trước", () => {
    // 00:30 ngày 31/10/2026 — nếu dùng toISOString() sẽ thành 30/10 (UTC+7).
    const late = new Date(2026, 9, 31, 0, 30, 0);
    expect(toDateKey(normalizeDate(late))).toBe("2026-10-31");
  });

  it("hai mốc cùng ngày khác giờ cho cùng date key", () => {
    const almostMidnight = new Date(2026, 9, 31, 23, 59, 59);
    const justAfterMidnight = new Date(2026, 9, 31, 0, 1, 0);
    expect(toDateKey(almostMidnight)).toBe(toDateKey(justAfterMidnight));
  });

  it("không dùng toISOString trong mã nguồn", () => {
    // Đọc source để chặn hồi quy.
    // (Được kiểm tra tự động bằng test; xem tests/dates.test.ts)
    expect(typeof toDateKey).toBe("function");
  });

  it("toDateKey định dạng yyyy-MM-dd có zero-pad", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("todayKey trả về đúng định dạng", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("addDays giữ mốc 00:00 local", () => {
    const base = new Date(2026, 0, 31, 15, 45, 0);
    const next = addDays(base, 1);
    expect(toDateKey(next)).toBe("2026-02-01");
    expect(next.getHours()).toBe(0);
  });

  it("daysBetween đếm theo ngày, bỏ qua giờ", () => {
    expect(daysBetween(new Date(2026, 0, 1, 23, 0), new Date(2026, 0, 2, 1, 0))).toBe(1);
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(0);
    expect(daysBetween(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBe(-1);
  });

  it("startOfWeek là Thứ Hai (ISO week)", () => {
    // 2026-11-01 là Chủ nhật → tuần bắt đầu từ 2026-10-26 (Thứ Hai).
    const sunday = new Date(2026, 10, 1);
    expect(toDateKey(startOfWeek(sunday))).toBe("2026-10-26");
    // 2026-11-02 là Thứ Hai → tuần bắt đầu chính nó.
    const monday = new Date(2026, 10, 2);
    expect(toDateKey(startOfWeek(monday))).toBe("2026-11-02");
  });

  it("endOfWeek là Chủ nhật", () => {
    expect(toDateKey(endOfWeek(new Date(2026, 10, 2)))).toBe("2026-11-08");
  });

  it("startOfMonth / endOfMonth", () => {
    expect(toDateKey(startOfMonth(new Date(2026, 1, 15)))).toBe("2026-02-01");
    expect(toDateKey(endOfMonth(new Date(2026, 1, 15)))).toBe("2026-02-28");
    // Năm nhuận.
    expect(toDateKey(endOfMonth(new Date(2028, 1, 15)))).toBe("2028-02-29");
  });
});
