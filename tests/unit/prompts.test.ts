/**
 * Unit test cho `src/lib/prompts.ts` (tasks.md 2.2 · FR-AI-09 · design.md §6.5).
 *
 * Điểm mấu chốt: `SYSTEM_PROMPT_V1` phải **tĩnh tuyệt đối**. Nếu có
 * `Date.now()`, UUID hay template literal động thì prefix cache mỗi lần gọi
 * sẽ khác nhau → prompt cache không bao giờ hit → tốn tiền (AC-5).
 *
 * Test cũng bảo vệ ranh giới giữa `prompts.ts` và `rubrics.ts`: file prompt
 * **không** được import rubric (rubric nằm ở file riêng, UI đọc từ đó).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT_V1 } from "@/lib/prompts";

const PROMPTS_FILE = path.join(process.cwd(), "src/lib/prompts.ts");
const source = readFileSync(PROMPTS_FILE, "utf8");

/**
 * Bỏ comment + string literal khỏi mã nguồn trước khi quét.
 *
 * Lý do: comment tiếng Việt của file có thể nhắc tới `Date.now()` (ví dụ
 * "không chứa Date.now()") — quét thẳng sẽ báo động giả. Ta chỉ quan tâm
 * **biểu thức thật** trong code.
 */
function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const code = stripCommentsAndStrings(source);

describe("SYSTEM_PROMPT_V1 — tính tĩnh (FR-AI-09)", () => {
  it("không chứa Date.now()", () => {
    expect(SYSTEM_PROMPT_V1).not.toContain("Date.now(");
    expect(code).not.toContain("Date.now(");
  });

  it("không chứa new Date(", () => {
    expect(SYSTEM_PROMPT_V1).not.toContain("new Date(");
    expect(code).not.toContain("new Date(");
  });

  it("không chứa Math.random", () => {
    expect(SYSTEM_PROMPT_V1).not.toContain("Math.random");
    expect(code).not.toContain("Math.random");
  });

  it("không chứa crypto.randomUUID", () => {
    expect(SYSTEM_PROMPT_V1).not.toContain("crypto.randomUUID");
    expect(code).not.toContain("crypto.randomUUID");
  });

  it("không chứa template literal động trong phần khai báo system prompt", () => {
    // `${...}` trong `SYSTEM_PROMPT_V1` nghĩa là prefix thay đổi theo runtime.
    const declaration = source.slice(
      source.indexOf("export const SYSTEM_PROMPT_V1"),
      source.indexOf("export const TASK_PROMPT_DAILY_PLAN"),
    );
    expect(declaration).not.toContain("${");
  });

  it("là hằng số ổn định giữa nhiều lần đọc", () => {
    // Đọc lại module → giá trị phải y hệt (không có state nội bộ).
    expect(SYSTEM_PROMPT_V1).toBe(SYSTEM_PROMPT_V1);
    expect(typeof SYSTEM_PROMPT_V1).toBe("string");
    expect(SYSTEM_PROMPT_V1.length).toBeGreaterThan(0);
  });
});

describe("prompts.ts — ranh giới với rubrics.ts", () => {
  it("không import từ rubrics.ts", () => {
    expect(source).not.toMatch(/from\s+["']@\/lib\/rubrics["']/);
    expect(source).not.toMatch(/from\s+["'].*rubrics["']/);
  });

  it("không chứa mảng tiêu chí rubric hardcode", () => {
    // Nếu rubric bị nhân bản vào prompt, hai nguồn sẽ lệch nhau → lệch cả điểm chấm.
    expect(source).not.toContain("RUBRIC_COMMUNICATION");
    expect(source).not.toContain("RUBRIC_TECHNICAL");
    expect(source).not.toContain("RUBRIC_BEHAVIORAL");
    expect(source).not.toContain("RUBRIC_LANGUAGE_ERRORS");
  });

  it("chỉ xuất system prompt + task prompt (không xuất hằng số thời gian)", () => {
    const exported = source.match(/export const \w+/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    for (const decl of exported) {
      const name = decl.replace("export const ", "");
      expect(name).toMatch(/^(SYSTEM_PROMPT_V1|TASK_PROMPT_[A-Z_]+)$/);
    }
  });
});
