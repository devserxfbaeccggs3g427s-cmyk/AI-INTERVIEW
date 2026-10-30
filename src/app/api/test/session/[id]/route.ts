/**
 * `GET /api/test/session/[id]` — lấy thông tin bài kiểm tra để hiển thị S20 (task 14.8/14.9).
 *
 * Hợp đồng:
 *   Response: `{ ok: true, data: { testId, lang, testType, items: [...] } }`
 *
 * Xem tasks.md 14.8 / 14.9 · design.md §4.19 / S20.
 */

import { NextResponse } from "next/server";

import "server-only";
import { prisma } from "@/lib/db";
import type { ItemType } from "@/lib/test-gen";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const testSession = await prisma.testSession.findUnique({
      where: { id },
      select: {
        id: true,
        lang: true,
        testType: true,
        level: true,
        blueprint: true,
        items: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            index: true,
            itemType: true,
            prompt: true,
            audioText: true,
            options: true,
            answer: true,
            userAnswer: true,
            cardId: true,
            seconds: true,
          },
        },
      },
    });

    if (!testSession) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Bài kiểm tra không tìm thấy" } },
        { status: 404 },
      );
    }

    const hasTimer = testSession.testType === "benchmark" || testSession.testType === "from_content";

    return NextResponse.json({
      ok: true,
      data: {
        testId: testSession.id,
        lang: testSession.lang as "zh" | "en",
        testType: testSession.testType,
        items: testSession.items.map((item) => ({
          index: item.index,
          itemType: item.itemType as ItemType,
          prompt: item.prompt,
          audioText: item.audioText,
          options: item.options as string[] | null,
          answer: item.answer,
          userAnswer: item.userAnswer,
          cardId: item.cardId,
          seconds: item.seconds,
        })),
        hasTimer,
        timeLimitSec: testSession.testType === "benchmark" ? 1800 : 600, // 30 phút cho benchmark, 10 phút cho from_content
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("[api/test/session/[id]]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể tải bài kiểm tra" } },
      { status: 500 },
    );
  }
}