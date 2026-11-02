/**
 * Unit test — buildPreview (FR-SC-27).
 *
 * - Gộp khoảng trắng thành 1.
 * - Cắt giữa câu nếu có dấu câu.
 * - Tối đa `max` ký tự, thêm `…`.
 */

import { describe, expect, it } from "vitest";

import { buildPreview } from "@/lib/costs";

describe("buildPreview (FR-SC-27)", () => {
  it("text ngắn hơn max ⇒ giữ nguyên", () => {
    expect(buildPreview("ngắn")).toBe("ngắn");
  });

  it("gộp khoảng trắng thành 1", () => {
    expect(buildPreview("a    b\n\nc")).toBe("a b c");
  });

  it("text dài hơn max ⇒ cắt + thêm …", () => {
    const text = "x".repeat(400);
    const result = buildPreview(text, 100);
    expect(result.length).toBeLessThanOrEqual(101);
    expect(result.endsWith("…")).toBe(true);
  });

  it("cắt giữa câu khi có dấu câu trong khoảng max", () => {
    // Câu 1 kết thúc ở ký tự ~50 (trong khoảng max = 100).
    const text = `${"a ".repeat(25)}. ${"b ".repeat(200)}`;
    const result = buildPreview(text, 100);

    expect(result.endsWith("…")).toBe(true);
    // Kết thúc bằng dấu chấm câu (cắt giữa câu) + …
    expect(result).toMatch(/\.…$/);
    // Không cắt quá 50% độ dài cho phép.
    expect(result.length).toBeLessThan(101);
  });

  it("không có dấu câu ⇒ cắt thẳng + …", () => {
    const text = "x".repeat(400);
    const result = buildPreview(text, 100);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBe(101); // 100 + …
  });

  it("mặc định max = 280", () => {
    const result = buildPreview("y".repeat(500));
    expect(result.length).toBeLessThanOrEqual(281);
  });

  it("dấu câu tiếng Trung (。) cũng được cắt", () => {
    const text = `${"中文 ".repeat(20)}。${"abc ".repeat(200)}`;
    const result = buildPreview(text, 100);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toMatch(/。…$/);
  });
});