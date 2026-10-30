/**
 * `POST /api/wipe` — xóa toàn bộ dữ liệu (task 17.8, 2-step confirm).
 *
 * Endpoint riêng biệt để DataTab gọi trực tiếp khi người dùng xác nhận xóa.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resetEmergencyModeCache, resetRouteOverrideCache } from "@/lib/ai/router";

export async function POST(_request: Request) {
  try {
    await prisma.$transaction(async (tx) => {
      // Xóa con trước cha (FK constraints)
      await tx.testItem.deleteMany();
      await tx.testSession.deleteMany();
      await tx.interviewTurn.deleteMany();
      await tx.interviewSession.deleteMany();
      await tx.interviewProfile.deleteMany();
      await tx.review.deleteMany();
      await tx.card.deleteMany();
      await tx.evidence.deleteMany();
      await tx.activity.deleteMany();
      await tx.skill.deleteMany();
      await tx.focusTarget.deleteMany();
      await tx.planItem.deleteMany();
      await tx.reflection.deleteMany();
      await tx.weeklyReviewRun.deleteMany();
      await tx.routeOverride.deleteMany();
      await tx.aiCall.deleteMany();
      await tx.dailyState.deleteMany();
      await tx.userProfile.deleteMany();
    });

    // Reset cache router
    resetEmergencyModeCache();
    resetRouteOverrideCache();

    return NextResponse.json({ ok: true, data: { message: "Đã xóa toàn bộ dữ liệu." } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "wipe_failed", message: "Không xóa được dữ liệu." } },
      { status: 500 },
    );
  }
}
