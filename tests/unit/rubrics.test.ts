/**
 * Unit test cho `src/lib/rubrics.ts` (tasks.md 2.1 · SPEC.md §5.5).
 *
 * Bảo vệ 2 thứ:
 *   1. Số tiêu chí cố định (5 / 5 / 4 / 4) — UI và prompt cùng dựa vào đây.
 *   2. Định danh `SCREAMING_SNAKE_CASE` (`constant`) — dùng làm tên export/nhánh
 *      switch trong UI. Khoá máy (`key`) phải là chữ thường không dấu để khớp
 *      enum trong schema zod (design.md §6.6).
 */

import { describe, expect, it } from "vitest";

import {
  RUBRIC_BEHAVIORAL,
  RUBRIC_BEHAVIORAL_CONSTANTS,
  RUBRIC_BEHAVIORAL_KEYS,
  RUBRIC_COMMUNICATION,
  RUBRIC_COMMUNICATION_CONSTANTS,
  RUBRIC_COMMUNICATION_KEYS,
  RUBRIC_LANGUAGE_ERROR_CONSTANTS,
  RUBRIC_LANGUAGE_ERROR_KEYS,
  RUBRIC_LANGUAGE_ERRORS,
  RUBRIC_TECHNICAL,
  RUBRIC_TECHNICAL_CONSTANTS,
  RUBRIC_TECHNICAL_KEYS,
} from "@/lib/rubrics";

/** `SCREAMING_SNAKE_CASE`: chỉ A–Z, số và gạch dưới; bắt đầu bằng chữ cái. */
const CONSTANT_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/** Khoá máy: chữ thường + số + gạch dưới, không khoảng trắng, không dấu. */
const KEY_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

describe("rubrics", () => {
  it("RUBRIC_COMMUNICATION có đúng 5 tiêu chí", () => {
    expect(RUBRIC_COMMUNICATION).toHaveLength(5);
  });

  it("RUBRIC_TECHNICAL có đúng 5 tiêu chí", () => {
    expect(RUBRIC_TECHNICAL).toHaveLength(5);
  });

  it("RUBRIC_BEHAVIORAL có đúng 4 tiêu chí", () => {
    expect(RUBRIC_BEHAVIORAL).toHaveLength(4);
  });

  it("RUBRIC_LANGUAGE_ERRORS có đúng 4 nhóm lỗi", () => {
    expect(RUBRIC_LANGUAGE_ERRORS).toHaveLength(4);
  });

  it("mọi định danh là SCREAMING_SNAKE_CASE (không khoảng trắng, không dấu)", () => {
    const allConstants = [
      ...RUBRIC_COMMUNICATION_CONSTANTS,
      ...RUBRIC_TECHNICAL_CONSTANTS,
      ...RUBRIC_BEHAVIORAL_CONSTANTS,
      ...RUBRIC_LANGUAGE_ERROR_CONSTANTS,
    ];

    for (const constant of allConstants) {
      expect(constant).toMatch(CONSTANT_PATTERN);
      expect(constant).not.toMatch(/\s/);
      // Dấu tiếng Việt (combining marks) cũng bị loại.
      expect(constant).not.toMatch(/[̀-ͯ]/);
    }
  });

  it("mọi khoá máy là chữ thường không dấu (khớp enum trong schema zod)", () => {
    const allKeys = [
      ...RUBRIC_COMMUNICATION_KEYS,
      ...RUBRIC_TECHNICAL_KEYS,
      ...RUBRIC_BEHAVIORAL_KEYS,
      ...RUBRIC_LANGUAGE_ERROR_KEYS,
    ];

    for (const key of allKeys) {
      expect(key).toMatch(KEY_PATTERN);
      expect(key).not.toMatch(/\s/);
      expect(key).not.toMatch(/[̀-ͯ]/);
    }
  });

  it("không có khoá tiêu chí trùng lặp trong cùng rubric", () => {
    expect(new Set(RUBRIC_COMMUNICATION_KEYS).size).toBe(RUBRIC_COMMUNICATION_KEYS.length);
    expect(new Set(RUBRIC_TECHNICAL_KEYS).size).toBe(RUBRIC_TECHNICAL_KEYS.length);
    expect(new Set(RUBRIC_BEHAVIORAL_KEYS).size).toBe(RUBRIC_BEHAVIORAL_KEYS.length);
    expect(new Set(RUBRIC_LANGUAGE_ERROR_KEYS).size).toBe(RUBRIC_LANGUAGE_ERROR_KEYS.length);
  });

  it("mọi tiêu chí có `key` + `constant` + `name` hiển thị tiếng Việt", () => {
    for (const c of [...RUBRIC_COMMUNICATION, ...RUBRIC_TECHNICAL, ...RUBRIC_BEHAVIORAL]) {
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.constant.length).toBeGreaterThan(0);
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.desc.trim().length).toBeGreaterThan(0);
    }
    for (const g of RUBRIC_LANGUAGE_ERRORS) {
      expect(g.key.length).toBeGreaterThan(0);
      expect(g.constant.length).toBeGreaterThan(0);
      expect(g.name.trim().length).toBeGreaterThan(0);
    }
  });
});
