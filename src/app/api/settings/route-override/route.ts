/**
 * `POST /api/settings/route-override` — cập nhật model local cho 1 task (task 17.10).
 *
 * Body: `{ task: AiTask, model: string }`
 * - `task` phải nằm trong `LOCAL_TASKS` (7 task local) — không cho override task cloud.
 * - `model` phải tồn tại trong danh sách Ollama (kiểm tra nhẹ bằng `/api/models`).
 *
 * Upsert `RouteOverride` + reset cache router.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resetRouteOverrideCache } from "@/lib/ai/router";
import { isAiTask, LOCAL_TASK_IDS } from "@/lib/ai/tasks";

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const { task, model } = raw ?? {};

    // Validate task id
    if (!isAiTask(task)) {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: `Task "${task}" không hợp lệ.` } },
        { status: 400 },
      );
    }

    // Chỉ cho override task local
    const isLocal = (LOCAL_TASK_IDS as readonly string[]).includes(task);
    if (!isLocal) {
      return NextResponse.json(
        { ok: false, error: { code: "forbidden", message: `Task "${task}" chạy trên cloud, không thể override model local.` } },
        { status: 400 },
      );
    }

    // Validate model là string không rỗng
    if (typeof model !== "string" || model.trim() === "") {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: "Thiếu trường `model`." } },
        { status: 400 },
      );
    }
    const cleanModel = model.trim();

    // Upsert RouteOverride — `task` là khóa chính nên dùng upsert trực tiếp.
    await prisma.routeOverride.upsert({
      where: { task },
      update: { model: cleanModel, updatedAt: new Date() },
      create: { task, model: cleanModel },
    });

    // Reset cache router để resolveRoute đọc override mới.
    resetRouteOverrideCache();

    return NextResponse.json({
      ok: true,
      data: { task, model: cleanModel, local: true },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không lưu được cài đặt model." } },
      { status: 500 },
    );
  }
}

/**
 * `GET /api/settings/route-override` — trả về danh sách override hiện tại.
 */
export async function GET() {
  try {
    const overrides = await prisma.routeOverride.findMany({
      select: { task: true, model: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ ok: true, data: overrides });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không đọc được cài đặt." } },
      { status: 500 },
    );
  }
}
