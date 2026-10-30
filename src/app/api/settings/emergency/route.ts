/**
 * `POST /api/settings/emergency` — bật/tắt chế độ khẩn cấp tiết kiệm (task 17.6).
 *
 * Body: `{ emergencyMode: boolean }`
 * Trả về: `{ ok, data: { emergencyMode } }` + reset cache router.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resetEmergencyModeCache } from "@/lib/ai/router";

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const { emergencyMode } = raw ?? {};

    if (typeof emergencyMode !== "boolean") {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: "Thiếu trường `emergencyMode` (boolean)." } },
        { status: 400 },
      );
    }

    // `UserProfile` là bảng singleton — dùng findFirst + upsert để chắc chắn luôn có 1 hàng.
    const profile = await prisma.userProfile.upsert({
      where: { id: (await prisma.userProfile.findFirst({ select: { id: true } }))?.id ?? "default" },
      update: { emergencyMode },
      create: { emergencyMode },
    });

    // Xoá cache trong router để resolveRoute đọc giá trị mới.
    resetEmergencyModeCache();

    return NextResponse.json({ ok: true, data: { emergencyMode: Boolean(profile.emergencyMode) } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không cập nhật được cài đặt." } },
      { status: 500 },
    );
  }
}
