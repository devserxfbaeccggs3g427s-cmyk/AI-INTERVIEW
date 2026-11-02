import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  endOfMonth,
  endOfWeek,
  normalizeDate,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  toDateKey,
  todayKey,
  toLocalDateTime,
} from "@/lib/dates";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Đọc source `src/lib/dates.ts` để kiểm tra không dùng `toISOString`. */
const DATES_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/lib/dates.ts", import.meta.url)),
  "utf8",
);

/**
 * FR-AF-20 — Chuẩn hóa ngày 00:00 LOCAL, không dùng toISOString().
 * AC-AF-11 — 23:59 và 00:01 cùng ngày → cùng date key.
 */
describe("FR-AF-20 — dates.ts chuẩn hóa ngày LOCAL", () => {
  it("normalizeDate → 00:00:00 local, không lệch múi giờ", () => {
    const d = normalizeDate(new Date(2026, 9, 31, 23, 59, 59));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(toDateKey(d)).toBe("2026-10-31");
  });

  it("AC-AF-11 — 23:59 và 00:01 cùng ngày → cùng date key", () => {
    const late = new Date(2026, 9, 31, 23, 59, 59);
    const early = new Date(2026, 10, 1, 0, 1, 0);
    expect(toDateKey(late)).toBe("2026-10-31");
    expect(toDateKey(early)).toBe("2026-11-01");
    expect(toDateKey(late)).not.toBe(toDateKey(early));
  });

  it("không dùng toISOString() trong mã nguồn (bảo vệ hồi quy)", () => {
    // Dùng regex để bắt cả `toISOString()` và `.toISOString()`.
    const matches = DATES_SOURCE.match(/\.toISOString\(\)/g);
    expect(matches).toBeNull();
  });

  it("toDateKey zero-pad tháng/ngày", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("todayKey() trả về yyyy-MM-dd", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("toLocalDateTime = normalizeDate (alias)", () => {
    const d = new Date(2026, 5, 15, 12, 30, 0);
    expect(toLocalDateTime(d)).toEqual(normalizeDate(d));
  });

  it("addDays giữ mốc 00:00 local", () => {
    const base = new Date(2026, 0, 31, 15, 45, 0);
    const next = addDays(base, 1);
    expect(toDateKey(next)).toBe("2026-02-01");
    expect(next.getHours()).toBe(0);
    // Trừ ngày.
    const prev = addDays(base, -1);
    expect(toDateKey(prev)).toBe("2026-01-30");
  });

  it("daysBetween bỏ qua giờ, đếm theo ngày local", () => {
    expect(daysBetween(new Date(2026, 0, 1, 23, 0), new Date(2026, 0, 2, 1, 0))).toBe(1);
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(0);
    expect(daysBetween(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBe(-1);
  });

  it("parseDateKey: định dạng đúng → Date 00:00 local", () => {
    const d = parseDateKey("2026-10-31");
    expect(d).not.toBeNull();
    expect(toDateKey(d!)).toBe("2026-10-31");
  });

  it("parseDateKey: ngày không tồn tại → null (2026-02-30)", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
  });

  it("parseDateKey: sai định dạng → null", () => {
    expect(parseDateKey("31/10/2026")).toBeNull();
    expect(parseDateKey("2026-13-01")).toBeNull();
    expect(parseDateKey("abc")).toBeNull();
  });

  it("startOfWeek là Thứ Hai (ISO week)", () => {
    // 2026-11-01 là Chủ nhật.
    expect(toDateKey(startOfWeek(new Date(2026, 10, 1)))).toBe("2026-10-26");
    // 2026-11-02 là Thứ Hai.
    expect(toDateKey(startOfWeek(new Date(2026, 10, 2)))).toBe("2026-11-02");
  });

  it("endOfWeek là Chủ nhật", () => {
    expect(toDateKey(endOfWeek(new Date(2026, 10, 2)))).toBe("2026-11-08");
  });

  it("startOfMonth / endOfMonth", () => {
    expect(toDateKey(startOfMonth(new Date(2026, 1, 15)))).toBe("2026-02-01");
    expect(toDateKey(endOfMonth(new Date(2026, 1, 15)))).toBe("2026-02-28");
    // NămLeap.
    expect(toDateKey(endOfMonth(new Date(2028, 1, 15)))).toBe("2028-02-29");
  });
});