/**
 * `POST /api/test/finish` — hoàn thành bài kiểm tra, tạo Activity + Evidence (task 14.19).
 *
 * Hợp đồng:
 *   Request : `{ testId: string, totalScore: number, maxScore: number, durationSec?: number }`
 *   Response: `{ ok: true, data: { activityId: string, evidenceId: string, skillId: string | null } }`
 *
 * - Tạo Activity (domain='language', type='test') gắn với TestSession.
 * - Tạo Evidence cho skill "Tiếng Trung" hoặc "Tiếng Anh" tùy `lang`.
 * - Cập nhật TestSession với score + durationSec.
 * - Tính rating Evidence 1..4 từ tỷ lệ đúng.
 *
 * Xem tasks.md 14.19 · design.md §4.19 / §5.1.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import { recomputeSkillLevel } from "@/lib/levels-server";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  testId: z.string().min(1),
  totalScore: z.number().min(0),
  maxScore: z.number().min(1),
  durationSec: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 },
      );
    }

    const { testId, totalScore, maxScore, durationSec } = parsed.data;

    // Lấy TestSession
    const testSession = await prisma.testSession.findUnique({
      where: { id: testId },
      select: { lang: true, topic: true, level: true },
    });

    if (!testSession) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Bài kiểm tra không tìm thấy" } },
        { status: 404 },
      );
    }

    // Xác định skill mục tiêu — "Tiếng Trung" hoặc "Tiếng Anh" trong domain language
    const skillName = testSession.lang === "zh" ? "Tiếng Trung" : "Tiếng Anh";
    const skill = await prisma.skill.findFirst({
      where: { name: skillName, domain: "language" },
      select: { id: true },
    });

    // Tính rating Evidence 1..4 từ tỷ lệ đúng (FR-SK-03: rating >= 3 mới tăng level)
    const pct = totalScore / maxScore;
    let rating: 1 | 2 | 3 | 4;
    if (pct >= 0.8) rating = 4;
    else if (pct >= 0.6) rating = 3;
    else if (pct >= 0.4) rating = 2;
    else rating = 1;

    // Tạo Activity + Evidence + cập nhật TestSession trong transaction
    let activityId: string | null = null;
    let evidenceId: string | null = null;
    let skillId: string | null = null;

    await prisma.$transaction(async (tx) => {
      // Cập nhật TestSession
      await tx.testSession.update({
        where: { id: testId },
        data: {
          score: totalScore,
          maxScore,
          durationSec: durationSec ?? null,
        },
      });

      // Tạo Activity (domain='language', type='test')
      const activity = await tx.activity.create({
        data: {
          skillId: skill?.id ?? null,
          domain: "language",
          type: "test",
          title: testSession.topic
            ? `Bài kiểm tra ${testSession.topic}`
            : `Bài kiểm tra ${testSession.lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}`,
          content: `Điểm: ${totalScore}/${maxScore}${durationSec ? ` | Thời gian: ${durationSec}s` : ""}`,
          minutes: durationSec ? Math.ceil(durationSec / 60) : 0,
          aiScore: totalScore,
        },
      });
      activityId = activity.id;

      // Gắn activity với testSession
      await tx.testSession.update({
        where: { id: testId },
        data: { activityId: activity.id },
      });

      // Tạo Evidence nếu có skill
      if (skill?.id) {
        const evidence = await tx.evidence.create({
          data: {
            activityId: activity.id,
            skillId: skill.id,
            rating,
          },
        });
        evidenceId = evidence.id;
        skillId = skill.id;
      }
    });

    // Tính lại level skill — **SAU** khi transaction đã commit.
    //
    // `recomputeSkillLevel` dùng Prisma client global, không phải `tx`. Nếu gọi
    // bên trong `prisma.$transaction`, truy vấn đó phải chờ write-lock do chính
    // transaction đang giữ → **deadlock** trên SQLite: transaction hết timeout
    // 5s và commit lỗi "Transaction already closed".
    if (skillId) {
      await recomputeSkillLevel(skillId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        activityId,
        evidenceId,
        skillId,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("[api/test/finish]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Không thể hoàn thành bài kiểm tra" } },
      { status: 500 },
    );
  }
}