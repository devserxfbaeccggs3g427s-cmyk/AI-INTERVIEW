/**
 * `POST /api/plan` — lưu / áp dụng 6 slot kế hoạch cho một ngày.
 *
 * Vai trò:
 *   - S02 dùng để **lưu chỉnh sửa thủ công** của người dùng trên 6 slot.
 *   - S02 dùng để **áp dụng** đúng bộ 6 slot AI vừa sinh (diff view → Apply).
 *   - `AiSuggestionCard` (S04) dùng để tạo 1 slot cho **ngày mai**.
 *
 * Hợp đồng:
 *   Request : `{ slots: SlotInput[], source?: "ai"|"manual"|"fallback", date?: string }`
 *   Response: `{ ok: true, data: { written, keptDone, removed } }`
 *            | `{ ok: false, error: { code, message } }`
 *
 * `POST /api/plan/generate` là endpoint **sinh mới** (gọi AI) — endpoint này chỉ
 * **ghi** những slot đã có sẵn nội dung. Tách vì S01 gọi `/api/plan/generate`
 * với `{ apply: true }` và không được đổi hợp đồng đó.
 *
 * Xem tasks.md 6.1 / 6.4 / 7.12 · design.md §4.2 · FR-DL-06.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import { applyPlanSlots, savePlanSlots } from "@/lib/plan-helpers";
import { normalizePlanSlots } from "@/lib/plan";
import { DOMAINS, type PlanSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

const SlotInput = z.object({
  slot: z.number().int().min(0).max(5),
  domain: z.enum(DOMAINS),
  action: z.string().min(1).max(200),
  detail: z.string().max(240).nullable(),
  minutes: z.number().int().min(1).max(120),
  skillId: z.string().nullable(),
  done: z.boolean(),
  source: z.enum(["ai", "manual", "fallback"]),
});

const RequestBody = z.object({
  /** 6 slot cần ghi. */
  slots: z.array(SlotInput).max(6),
  /** Nguồn của bộ slot — ghi vào `PlanItem.source`. */
  source: z.enum(["ai", "manual", "fallback"]).default("manual"),
  /** Ngày đích — ISO `YYYY-MM-DD` (giờ local). Mặc định hôm nay. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Parse `YYYY-MM-DD` thành Date lúc 00:00 giờ local. */
function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const date = new Date(y, mo - 1, d);
  // Bảo vệ ngày không tồn tại (ví dụ 31/02) → Date tự lùi sang tháng sau.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return startOfDay(date);
}

/**
 * `GET /api/plan` — trả 6 slot của ngày + danh sách skill + meta AI gần nhất.
 *
 * Dùng cho client refresh sau khi áp dụng kế hoạch và cho e2e test kiểm tra
 * trạng thái thực trong DB.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam ? parseLocalDate(dateParam) : startOfDay(new Date());
  if (!date) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Ngày không hợp lệ." } },
      { status: 400 },
    );
  }

  const [items, skills, lastCall] = await Promise.all([
    prisma.planItem.findMany({ where: { date }, orderBy: { slot: "asc" } }),
    prisma.skill.findMany({
      select: { id: true, name: true, domain: true, parentId: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    prisma.aiCall.findFirst({
      where: { feature: "daily_plan" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      date: date.toISOString(),
      slots: items.map((i) => ({
        slot: i.slot,
        domain: i.domain,
        action: i.action,
        detail: i.detail,
        minutes: i.minutes,
        skillId: i.skillId,
        done: i.done,
        source: i.source,
      })),
      skills,
      meta: lastCall
        ? {
            provider: lastCall.provider,
            model: lastCall.model,
            effort: "medium",
            inputTokens: lastCall.inputTokens,
            outputTokens: lastCall.outputTokens,
            cacheRead: lastCall.cacheRead,
            cacheWrite: lastCall.cacheWrite,
            estimatedCost: lastCall.estimatedCost,
            latencyMs: lastCall.latencyMs,
            fallbackFrom: lastCall.fallbackFrom,
          }
        : null,
    },
  });
}

/**
 * `POST /api/plan` — ghi 6 slot.
 *
 * FR-DL-06: slot đã `done` **giữ nguyên** — không bị ghi đè.
 * Cấu trúc 6 slot cố định (SPEC.md §2.1) → `normalizePlanSlots` ép lại domain
 * theo `SLOT_TEMPLATE` nên client không thể đổi trục.
 */
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

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: "Dữ liệu kế hoạch không hợp lệ.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const { slots, source, date } = parsed.data;

  let target = startOfDay(new Date());
  if (date) {
    const parsedDate = parseLocalDate(date);
    if (!parsedDate) {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: "Ngày không hợp lệ." } },
        { status: 400 },
      );
    }
    target = parsedDate;
  }

  try {
    // `normalizePlanSlots` giữ đúng 6 slot, ép domain theo template và kẹp
    // thời lượng — nên "xoá" slot trong UI chỉ có nghĩa là để trống nội dung.
    const normalized: PlanSlot[] = normalizePlanSlots(
      slots.map((s) => ({
        slot: s.slot,
        domain: s.domain,
        action: s.action,
        detail: s.detail,
        minutes: s.minutes,
        skillId: s.skillId,
        done: s.done,
        source,
      })),
    );

    const result =
      source === "manual"
        ? await savePlanSlots(normalized, { date: target, source })
        : await applyPlanSlots(normalized, { date: target, source });

    return NextResponse.json({
      ok: true,
      data: {
        written: result.written,
        keptDone: result.keptDone,
        removed: result.removed,
        date: target.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Không lưu được kế hoạch, thử lại." } },
      { status: 500, headers: { "x-error-detail": message.slice(0, 200) } },
    );
  }
}
