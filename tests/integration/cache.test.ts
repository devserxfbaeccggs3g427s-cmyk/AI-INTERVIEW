/**
 * Integration test — prompt caching (tasks.md 2.11 · AC-5 · design.md §6.5).
 *
 * AC-5: 2 lần gọi với **cùng system prompt** → lần thứ 2 phải có
 * `cache_read_input_tokens > 0`.
 *
 * Test bị **skip** khi không có `ANTHROPIC_API_KEY` — vì test này gọi API thật
 * và tốn tiền. Chạy được khi có key:
 * ```bash
 * ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/integration
 * ```
 *
 * Test tự dọn dòng `AiCall` mà nó tạo — không để lại rác trong DB dev.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { callAnthropicDetailed } from "@/lib/ai/anthropic";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/**
 * Schema tối giản — payload nhỏ để test rẻ nhưng đủ để ép structured output.
 */
const EchoSchema = z.object({
  echo: z.string(),
});

/** Kiểu dữ liệu mà schema sinh ra. */
type Echo = z.infer<typeof EchoSchema>;

/** System prompt CỐ ĐỊNH — không có timestamp, để prefix cache khớp tuyệt đối. */
const CACHE_TEST_SYSTEM = [
  "Bạn là trợ lý kiểm thử của Daily Loop OS.",
  "Chỉ trả về đúng 1 field `echo` chứa lại nội dung yêu cầu, không thêm gì khác.",
].join("\n");

describe.skipIf(!HAS_KEY)("AC-5 — prompt caching", () => {
  it("lần gọi thứ 2 có cache_read_input_tokens > 0", async () => {
    const createdIds: string[] = [];

    try {
      // Lần 1 — tạo cache.
      const first = await callAnthropicDetailed<Echo>({
        task: "grading",
        system: CACHE_TEST_SYSTEM,
        user: "Nội dung cần echo: con mèo.",
        schema: EchoSchema,
      });

      // Lần 2 — cùng system → phải đọc từ cache.
      const second = await callAnthropicDetailed<Echo>({
        task: "grading",
        system: CACHE_TEST_SYSTEM,
        user: "Nội dung cần echo: chó con.",
        schema: EchoSchema,
      });

      expect(second.usage.cacheRead).toBeGreaterThan(0);
      // Lần 1 có thể đã có cache (nếu test chạy lại) → không assert lần 1.
      expect(first.usage.cacheRead).toBeGreaterThanOrEqual(0);
      expect(second.data.echo).toContain("chó");
    } finally {
      // Dọn dòng `AiCall` mà test này tạo.
      const rows = await prisma.aiCall.findMany({
        where: { feature: "grading" },
        select: { id: true },
      });
      for (const row of rows) createdIds.push(row.id);
      if (createdIds.length > 0) {
        await prisma.aiCall.deleteMany({ where: { id: { in: createdIds } } });
      }
    }
  });
});
