/**
 * `PATCH /api/test/answer` — lưu câu trả lời từng câu ngay lập tức (task 14.9).
 *
 * Hợp đồng:
 *   Request : `{ testId: string, index: number, userAnswer: string, seconds?: number }`
 *   Response: `{ ok: true, data: { item: { id, index, itemType, userAnswer, seconds } } }`
 *
 * - Ghi `TestItem.userAnswer` + `TestItem.seconds` ngay khi người dùng trả lời →
 *   không mất dữ liệu khi đóng tab (FR-LT-09).
 * - Cho phép quay lại câu đã trả lời → load `userAnswer` đã lưu.
 *
 * Xem tasks.md 14.9 · design.md §4.20.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  testId: z.string().min(1),
  index: z.number().int().min(0),
  userAnswer: z.string(),
  seconds: z.number().int().nonnegative().optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }

    const { testId, index, userAnswer, seconds } = parsed.data;

    // Cập nhật TestItem — tìm theo testId + index
    const item = await prisma.testItem.updateMany({
      where: {
        testId,
        index,
      },
      data: {
        userAnswer: userAnswer || null,
        ...(seconds !== undefined ? { seconds } : {}),
      },
    });

    if (item.count === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Câu hỏi không tìm thấy" } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { message: "Đã lưu câu trả lời" },
    });
  } catch (error) {
    console.error("[api/test/answer]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể lưu câu trả lời" } },
      { status: 500 },
    );
  }
}