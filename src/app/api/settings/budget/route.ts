/**
 * `POST /api/settings/budget` — đặt / bỏ ngân sách chi phí AI tháng (task 17.1).
 *
 * Body: `{ monthlyBudgetUsd: number | null }`
 * Trả về: `{ ok, data: { monthlyBudgetUsd } }`.
 *
 * ⚠️ `UserProfile` là bảng singleton (app luôn đọc hàng đầu tiên theo
 * `createdAt asc`) → dùng `findFirst` + `update` để không sinh hàng trùng.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const { monthlyBudgetUsd } = raw ?? {};

    // `null` = bỏ ngân sách. Nếu có giá trị thì phải là số > 0.
    if (monthlyBudgetUsd !== null && monthlyBudgetUsd !== undefined) {
      const value = Number(monthlyBudgetUsd);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "validation",
              message: "Ngân sách phải là số ≥ 0 (hoặc `null` để bỏ đặt).",
            },
          },
          { status: 400 },
        );
      }
      if (value > 1_000_000) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "validation", message: "Ngân sách vượt quá giới hạn cho phép." },
          },
          { status: 400 },
        );
      }
    }

    const existing = await prisma.userProfile.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const nextBudget =
      monthlyBudgetUsd === null || monthlyBudgetUsd === undefined
        ? null
        : Number(monthlyBudgetUsd);

    if (existing) {
      await prisma.userProfile.update({
        where: { id: existing.id },
        data: { monthlyBudgetUsd: nextBudget },
      });
    } else {
      await prisma.userProfile.create({
        data: { monthlyBudgetUsd: nextBudget },
      });
    }

    return NextResponse.json({ ok: true, data: { monthlyBudgetUsd: nextBudget } });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không lưu được ngân sách." } },
      { status: 500 },
    );
  }
}
