/**
 * Unit test — maskKey (FR-SC-11).
 *
 * Key ngắn (< 8 ký tự) ⇒ `••••` (không lộ ký tự nào).
 * Key dài ⇒ 7 ký tự đầu + 4 ký tự cuối, giữa là bullet dots.
 */

import { describe, expect, it } from "vitest";

import { maskKey } from "@/lib/costs";

describe("maskKey (FR-SC-11)", () => {
  it("key ngắn (< 8 ký tự) ⇒ ••••, không lộ ký tự nào", () => {
    expect(maskKey("abc")).toBe("••••");
    expect(maskKey("")).toBe("");
  });

  it("key dài ⇒ 7 ký tự đầu + 4 ký tự cuối, giữa là ••••••••", () => {
    const key = "sk-ant-abcdefghijklmnopqrstuv";
    const masked = maskKey(key);

    expect(masked.startsWith("sk-ant-")).toBe(true); // 7 ký tự đầu
    expect(masked.endsWith("tuv")).toBe(true); // 4 ký tự cuối
    expect(masked).toContain("•");
    // Không chứa phần giữa.
    expect(masked).not.toContain("bcdefghijklmno");
  });

  it("key đúng 8 ký tự ⇒ 7 đầu + 4 cuối (overlap)", () => {
    const key = "12345678";
    const masked = maskKey(key);
    expect(masked).toBe("1234567••••••••5678"); // 7 đầu + 8 bullet + 4 cuối
  });

  it("prefix 'sk-ant-' luôn hiển thị (7 ký tự đầu)", () => {
    const key = "sk-ant-abcdef";
    const masked = maskKey(key);
    expect(masked.startsWith("sk-ant-")).toBe(true);
  });
});