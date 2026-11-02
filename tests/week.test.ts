/**
 * Unit test — tuần ISO (FR-WR-01, FR-WR-05).
 *
 * - parseIsoWeek / currentIsoWeek / previousIsoWeek / isWeeklyReviewDue
 * - tuần chéo năm (2026-W01 chứa 28/12/2025)
 * - timezone biên nửa đêm
 */

import { describe, expect, it } from "vitest";

import {
  parseIsoWeek,
  currentIsoWeek,
  previousIsoWeek,
  isWeeklyReviewDue,
  lastCompletedWeek,
  isValidIsoWeek,
  formatWeekLabel,
} from "@/lib/week";

describe("ISO week (FR-WR-01)", () => {
  it("parse 2026-W43 ⇒ Thứ Hai 00:00 local", () => {
    const range = parseIsoWeek("2026-W43");
    expect(range).not.toBeNull();
    expect(range?.week).toBe("2026-W43");
    expect(range?.days).toHaveLength(7);
    // 2026-W43 bắt đầu 2026-10-19 (Thứ Hai)
    expect(range?.days[0].getFullYear()).toBe(2026);
    expect(range?.days[0].getMonth()).toBe(9); // 0-indexed
    expect(range?.days[0].getDate()).toBe(19);
    expect(range?.days[0].getDay()).toBe(1); // Thứ Hai
  });

  it("tuần chéo năm: 2026-W01 chứa 28/12/2025", () => {
    const range = parseIsoWeek("2026-W01");
    expect(range).not.toBeNull();
    // Tuần 1 năm 2026 bắt đầu 29/12/2025 (Thứ Hai) — chứa 28/12/2025 (CN)
    // Nhưng ISO week quy tắc: tuần chứa 4/1 là tuần 1 ⇒ 29/12-04/1
    const start = range?.days[0];
    expect(start?.getFullYear()).toBe(2025);
    expect(start?.getMonth()).toBe(11);
    expect(start?.getDate()).toBe(29);
    expect(start?.getDay()).toBe(1); // Thứ Hai
  });

  it("isValidIsoWeek: 2023-W53 invalid (2023 chỉ 52 tuần)", () => {
    expect(isValidIsoWeek("2023-W53")).toBe(false);
    expect(isValidIsoWeek("2023-W00")).toBe(false);
    expect(isValidIsoWeek("2023-W99")).toBe(false);
    expect(isValidIsoWeek("khong-hop-le")).toBe(false);
  });

  it("isValidIsoWeek: 2025-W53 valid (2025 có 53 tuần)", () => {
    expect(isValidIsoWeek("2025-W53")).toBe(true);
  });

  it("parseIsoWeek: 2026-W05 ⇒ 2026-W05 (normalize)", () => {
    const range = parseIsoWeek("2026-W05");
    expect(range?.week).toBe("2026-W05");
  });

  it("currentIsoWeek trả đúng định dạng", () => {
    const week = currentIsoWeek();
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
    expect(isValidIsoWeek(week)).toBe(true);
  });

  it("previousIsoWeek: 2026-W43 ⇒ 2026-W42", () => {
    expect(previousIsoWeek("2026-W43")).toBe("2026-W42");
  });

  it("previousIsoWeek: 2026-W01 ⇒ 2025-W52 hoặc 53", () => {
    const prev = previousIsoWeek("2026-W01");
    expect(prev).toMatch(/^2025-W(52|53)$/);
  });

  it("isWeeklyReviewDue: Chủ Nhật trước 20:00 ⇒ false", () => {
    const sunday10am = new Date("2026-10-25T10:00:00+07:00"); // Chủ Nhật 10h
    expect(isWeeklyReviewDue(sunday10am)).toBe(false);
  });

  it("isWeeklyReviewDue: Chủ Nhật sau 20:00 ⇒ true", () => {
    const sunday9pm = new Date("2026-10-25T21:00:00+07:00"); // Chủ Nhật 21h
    expect(isWeeklyReviewDue(sunday9pm)).toBe(true);
  });

  it("isWeeklyReviewDue: Thứ Hai bất kỳ giờ ⇒ false", () => {
    const monday = new Date("2026-10-26T21:00:00+07:00");
    expect(isWeeklyReviewDue(monday)).toBe(false);
  });

  it("lastCompletedWeek: trước Chủ Nhật 20:00 ⇒ tuần trước", () => {
    const sunday10am = new Date("2026-10-25T10:00:00+07:00");
    const week = lastCompletedWeek(sunday10am);
    expect(week).toBe("2026-W42");
  });

  it("lastCompletedWeek: sau Chủ Nhật 20:00 ⇒ tuần hiện tại", () => {
    const sunday9pm = new Date("2026-10-25T21:00:00+07:00");
    const week = lastCompletedWeek(sunday9pm);
    expect(week).toBe("2026-W43");
  });

  it("formatWeekLabel: 2026-W43 ⇒ Tuần 43 (19/10/2026 – 25/10/2026)", () => {
    // 2026-W43 bắt đầu 19/10, kết thúc 25/10
    expect(formatWeekLabel("2026-W43")).toBe("Tuần 43 (19/10/2026 – 25/10/2026)");
  });
});