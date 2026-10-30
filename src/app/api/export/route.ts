/**
 * `POST /api/export` — xuất toàn bộ DB thành JSON (task 17.7).
 *
 * Trả file JSON gồm tất cả bảng chính (có thứ tự quan hệ). Dùng stream để
 * tránh OOM với DB lớn.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Route không dùng API riêng của `NextRequest` → nhận `Request` để test có
 * thể gọi handler trực tiếp (không cần dựng `NextRequest`).
 */
export async function POST(_request: Request) {
  try {
    const data = await prisma.$transaction(async (tx) => {
      // KHÔNG dùng `include` — trường quan hệ (`children`) không phải cột nên
      // sẽ hỏng vòng export → import (createMany không nhận field lạ).
      const skills = await tx.skill.findMany();
      const activities = await tx.activity.findMany();
      const evidences = await tx.evidence.findMany();
      const reflections = await tx.reflection.findMany();
      const planItems = await tx.planItem.findMany();
      const focusTargets = await tx.focusTarget.findMany();
      const dailyStates = await tx.dailyState.findMany();
      const cards = await tx.card.findMany();
      const reviews = await tx.review.findMany();
      const profiles = await tx.userProfile.findMany();
      const weeklyReviews = await tx.weeklyReviewRun.findMany();
      const routeOverrides = await tx.routeOverride.findMany();
      const aiCalls = await tx.aiCall.findMany();
      const interviewProfiles = await tx.interviewProfile.findMany();
      const interviewSessions = await tx.interviewSession.findMany();
      const interviewTurns = await tx.interviewTurn.findMany();
      const testSessions = await tx.testSession.findMany();
      const testItems = await tx.testItem.findMany();

      return {
        exportAt: new Date().toISOString(),
        version: "1.0",
        tables: {
          skill: skills,
          activity: activities,
          evidence: evidences,
          reflection: reflections,
          planItem: planItems,
          focusTarget: focusTargets,
          dailyState: dailyStates,
          card: cards,
          review: reviews,
          userProfile: profiles,
          weeklyReviewRun: weeklyReviews,
          routeOverride: routeOverrides,
          aiCall: aiCalls,
          interviewProfile: interviewProfiles,
          interviewSession: interviewSessions,
          interviewTurn: interviewTurns,
          testSession: testSessions,
          testItem: testItems,
        },
      };
    });

    const json = JSON.stringify(data, null, 2);
    const filename = `daily-loop-backup-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "export_failed", message: "Không xuất được file." } },
      { status: 500 },
    );
  }
}
