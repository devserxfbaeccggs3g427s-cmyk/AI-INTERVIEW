/**
 * `POST /api/log` — endpoint ghi nhật **duy nhất** cho mọi loại hoạt động.
 *
 * Dùng chung cho:
 *   - S01 bấm "Xong" trên slot          (tasks.md 4.5 · FR-DL-03)
 *   - S05 Quick-log "Ghi nhanh ngay"    (tasks.md 5.3 · FR-LG-01)
 *   - S05 checkbox "Tự động tạo 1 Evidence" (tasks.md 5.5)
 *   - S03 "Luyện tập đo lường ngay"    (tasks.md 7.3 · FR-SK-01)
 *
 * Vì có nhiều nơi gọi, endpoint phải **nhanh và idempotent**:
 *   - Không chờ AI (AI chỉ chạy ở `/api/log/autofill`, sau khi đã ghi).
 *   - Ghi `Activity` tức thì, trả về ngay cho UI đóng sheet trong ≤10s.
 *
 * Xem design.md §4.5 · requirements.md FR-DL-03.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recomputeSkillLevel } from "@/lib/levels-server";
import { ACTIVITY_TYPES, DOMAINS, type ActivityType, type Domain } from "@/lib/types";

/**
 * Body của request.
 *
 * `source` cho biết hành động đến từ đâu — quyết định có đánh dấu
 * `PlanItem.done` hay không.
 */
const LogBody = z.object({
  /** Nguồn ghi: `plan_item` = bấm "Xong" ở S01; `quick_log` = sheet S05; `practice` = nút luyện ngay ở S03. */
  source: z.enum(["plan_item", "quick_log", "practice"]).default("quick_log"),
  /** Id của `PlanItem` (chỉ khi source = "plan_item"). */
  planItemId: z.string().optional(),
  /** Domain hoạt động. */
  domain: z.enum(DOMAINS),
  /** Loại hoạt động. */
  type: z.enum(ACTIVITY_TYPES).default("custom"),
  /** Tiêu đề. */
  title: z.string().trim().min(1).max(200),
  /** Nội dung chi tiết (tùy chọn). */
  content: z.string().max(4000).optional(),
  /** Thời lượng (phút). */
  minutes: z.number().int().min(0).max(600).default(0),
  /** Skill liên quan (tùy chọn) — dùng cho Evidence + tăng level. */
  skillId: z.string().optional(),
  /** Rating bằng chứng 1..4 (tùy chọn) — chỉ tạo Evidence khi có rating. */
  rating: z.number().int().min(1).max(4).optional(),
  /** Tự động tạo 1 Evidence (task 5.5). */
  createEvidence: z.boolean().default(false),
  /** Tự đánh giá chất lượng 1..5 (tùy chọn). */
  quality: z.number().int().min(1).max(5).optional(),
});

export type LogRequest = z.infer<typeof LogBody>;

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  const parsed = LogBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: "Dữ liệu ghi nhận không hợp lệ.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const body = parsed.data;

  try {
    // Skill phải tồn tại thì mới gắn Evidence — tránh FK lỗi khi client gửi
    // skillId đã bị xoá.
    let skillId: string | null = body.skillId ?? null;
    if (skillId) {
      const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } });
      if (!skill) skillId = null;
    }

    const activity = await prisma.activity.create({
      data: {
        skillId,
        domain: body.domain,
        type: body.type as ActivityType,
        minutes: body.minutes,
        title: body.title,
        content: body.content ?? null,
        quality: body.quality ?? null,
      },
    });

    // Tạo Evidence khi có skill + rating, hoặc khi tick "tự động tạo Evidence".
    // FR-SK-03: chỉ Evidence rating >= 3 mới làm tăng level.
    const shouldCreateEvidence =
      skillId !== null && (body.createEvidence || body.rating !== undefined);
    let evidenceId: string | null = null;

    if (shouldCreateEvidence && skillId !== null) {
      const rating = body.rating ?? 3;
      const evidence = await prisma.evidence.create({
        data: { activityId: activity.id, skillId, rating },
      });
      evidenceId = evidence.id;
      await recomputeSkillLevel(skillId);
    }

    // Đánh dấu PlanItem đã xong (chỉ khi đến từ S01).
    let planItemDone = false;
    if (body.source === "plan_item" && body.planItemId) {
      const updated = await prisma.planItem.updateMany({
        where: { id: body.planItemId, done: false },
        data: { done: true },
      });
      planItemDone = updated.count > 0;
    }

    return NextResponse.json({
      ok: true,
      data: {
        activityId: activity.id,
        evidenceId,
        planItemDone,
        skillId,
        createdAt: activity.createdAt.toISOString(),
      },
    });
  } catch (error) {
    // Lỗi DB (SQLite locked) → 500 theo design.md §7.2, không crash app.
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không ghi được, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}

/**
 * `GET /api/log` — lịch sử hoạt động (S05 tab "Lịch sử").
 *
 * Query: `?domain=professional&limit=50`
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const domainParam = url.searchParams.get("domain");
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50;

  const domain: Domain | undefined = DOMAINS.includes(domainParam as Domain)
    ? (domainParam as Domain)
    : undefined;

  const activities = await prisma.activity.findMany({
    where: domain ? { domain } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      skill: { select: { id: true, name: true } },
      evidences: { select: { id: true, rating: true, skillId: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    data: activities.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      domain: a.domain,
      type: a.type,
      minutes: a.minutes,
      skillName: a.skill?.name ?? null,
      rating: a.evidences[0]?.rating ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
