/**
 * `POST /api/journal/entry` — lưu 1 entry nhật ký (tasks.md 12.4 / 12.6 · S06).
 *
 * Hợp đồng:
 *   Request (tạo entry):
 *     `{ content, prompt?, title?, domain?, skillId?, rating?, createEvidence?, aiFeedback?, minutes? }`
 *   Request (gắn Evidence vào entry đã lưu):
 *     `{ activityId, rating, createEvidence: true }`
 *   Response: `{ ok: true, data: { activityId, reflectionId, evidenceId, skillId, skillLevel } }`
 *            | `{ ok: false, error: { code, message } }`
 *
 * Vì sao cần route riêng (không dùng `POST /api/log`):
 *   `Reflection.activityId` là **unique** — 1 entry nhật ký = 1 `Activity` +
 *   1 `Reflection` gắn 1-1. `POST /api/log` chỉ tạo `Activity` (không tạo
 *   `Reflection`) và không cho gắn Evidence vào một Activity đã có.
 *   Nếu dùng `/api/log` cho nút "Chấp nhận → tạo Evidence" thì Evidence sẽ
 *   bị treo lơ lửng ở 1 Activity riêng, mất liên kết với entry nhật ký.
 *
 * Ghi 1 lần → gọi `recomputeSkillLevel` để cập nhật level của skill.
 *
 * Xem tasks.md 12.4 / 12.6 · design.md §4.6 / §5.1 / §5.2 · FR-SK-03.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { JOURNAL_MAX_LENGTH } from "@/lib/journal";
import { recomputeSkillLevel } from "@/lib/levels-server";
import { DOMAINS, type Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Phản hồi AI đã serialize — nhận cả dạng object lẫn string thuần. */
const AiFeedbackInput = z.union([
  z.object({
    summary: z.string().max(1000),
    sharpQuestion: z.string().max(1000),
  }),
  z.string().max(4000),
]);

const RequestBody = z
  .object({
    /** Nội dung entry — bắt buộc khi TẠO entry. */
    content: z.string().trim().min(1).max(JOURNAL_MAX_LENGTH).optional(),
    /** Câu hỏi gợi ý đã dùng khi viết (lưu vào `Reflection.prompt`). */
    prompt: z.string().max(500).optional(),
    /** Tiêu đề entry (mặc định: trích 80 ký tự đầu nội dung). */
    title: z.string().trim().max(200).optional(),
    /** Domain của entry — journal dùng `personal`. */
    domain: z.enum(DOMAINS).optional(),
    /** Skill liên quan — dùng cho Evidence. */
    skillId: z.string().optional(),
    /** Rating bằng chứng 1..4 (chỉ tạo Evidence khi có rating). */
    rating: z.number().int().min(1).max(4).optional(),
    /** Tạo Evidence gắn vào skill. */
    createEvidence: z.boolean().default(false),
    /** Ghi chú AI lưu vào `Reflection.aiFeedback`. */
    aiFeedback: AiFeedbackInput.optional(),
    /** Thời lượng (phút) — mặc định 5 (slot "Nhật ký" của Daily Loop). */
    minutes: z.number().int().min(0).max(600).optional(),
    /** Id của `Activity` đã lưu — dùng để gắn Evidence vào entry có sẵn. */
    activityId: z.string().optional(),
  })
  .refine(
    (v) => (v.activityId !== undefined) !== (v.content !== undefined),
    "Cần đúng một trong hai: `content` (tạo entry) hoặc `activityId` (gắn Evidence).",
  );

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text.length > 0) raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: "Dữ liệu entry nhật ký không hợp lệ.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const body = parsed.data;

  try {
    // ── Nhánh 1: gắn Evidence vào entry đã lưu ──────────────────────────────
    if (body.activityId) {
      const activity = await prisma.activity.findUnique({
        where: { id: body.activityId },
        select: { id: true, skillId: true },
      });
      if (!activity) {
        return NextResponse.json(
          { ok: false, error: { code: "not_found", message: "Không tìm thấy entry nhật ký." } },
          { status: 404 },
        );
      }

      const skillId = body.skillId ?? activity.skillId ?? null;
      let evidenceId: string | null = null;
      let skillLevel: number | null = null;

      if (body.createEvidence && skillId) {
        const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } });
        if (skill) {
          const evidence = await prisma.evidence.create({
            data: {
              activityId: activity.id,
              skillId,
              rating: body.rating ?? 3,
            },
          });
          evidenceId = evidence.id;
          skillLevel = await recomputeSkillLevel(skillId);
        }
      }

      return NextResponse.json({
        ok: true,
        data: {
          activityId: activity.id,
          reflectionId: null,
          evidenceId,
          skillId,
          skillLevel,
        },
      });
    }

    // ── Nhánh 2: tạo entry mới (Activity + Reflection) ─────────────────────
    const content = body.content ?? "";

    // Skill phải tồn tại thì mới gắn Evidence — tránh FK lỗi khi client gửi
    // skillId đã bị xoá.
    let skillId: string | null = body.skillId ?? null;
    if (skillId) {
      const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } });
      if (!skill) skillId = null;
    }

    const domain: Domain = body.domain ?? "personal";
    const title = body.title?.trim() || content.slice(0, 80);

    const activity = await prisma.activity.create({
      data: {
        skillId,
        domain,
        type: "journal",
        minutes: body.minutes ?? 5,
        title,
        content,
      },
    });

    const reflection = await prisma.reflection.create({
      data: {
        activityId: activity.id,
        prompt: body.prompt ?? "",
        answer: content,
        aiFeedback:
          typeof body.aiFeedback === "string"
            ? body.aiFeedback
            : body.aiFeedback
              ? JSON.stringify(body.aiFeedback)
              : null,
      },
    });

    // Tạo Evidence khi có skill + rating (FR-SK-03: chỉ rating >= 3 mới tăng level).
    const shouldCreateEvidence = skillId !== null && (body.createEvidence || body.rating !== undefined);
    let evidenceId: string | null = null;
    let skillLevel: number | null = null;

    if (shouldCreateEvidence && skillId !== null) {
      const evidence = await prisma.evidence.create({
        data: { activityId: activity.id, skillId, rating: body.rating ?? 3 },
      });
      evidenceId = evidence.id;
      skillLevel = await recomputeSkillLevel(skillId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        activityId: activity.id,
        reflectionId: reflection.id,
        evidenceId,
        skillId,
        skillLevel,
        createdAt: activity.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không lưu được, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}

/**
 * `GET /api/journal/entry` — lịch sử entry nhật ký (task 12.6).
 *
 * Query: `?limit=20`
 *
 * Đọc bảng `Reflection` join `Activity` liên quan 1-1 (`activityId` là
 * `@unique`) + `Skill` để lấy tên kỹ năng. Mới nhất trước.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 20;

  try {
    const reflections = await prisma.reflection.findMany({
      // `createdAt` chỉ chính xác tới mili-giây — 2 entry tạo trong cùng ms sẽ
      // hoán đổi thứ tự. `cuid()` tăng dần theo thời gian nên dùng làm
      // tiebreaker để thứ tự luôn ổn định (mới nhất trước).
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        activity: {
          select: {
            id: true,
            title: true,
            domain: true,
            createdAt: true,
            skill: { select: { name: true } },
          },
        },
      },
    });

    const entries = reflections.map((r) => ({
      id: r.id,
      activityId: r.activityId,
      title: r.activity.title,
      prompt: r.prompt,
      answer: r.answer,
      aiFeedback: r.aiFeedback,
      domain: r.activity.domain as Domain,
      skillName: r.activity.skill?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ ok: true, data: entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không tải được lịch sử." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}
