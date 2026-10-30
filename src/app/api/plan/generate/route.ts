/**
 * `POST /api/plan/generate` — AI-01 sinh 6 slot kế hoạch cho hôm nay.
 *
 * Hợp đồng (S01 và S02 đều gọi — phải giữ nguyên):
 *   Request : `{ apply?: boolean }`
 *   Response: `{ ok: true, data: { slots: PlanSlot[], meta: AiCallMeta } }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * - `apply: false` (mặc định) → chỉ sinh & trả về, KHÔNG ghi DB.
 * - `apply: true` → ghi đè `PlanItem` hôm nay, **giữ slot đã `done`** (FR-DL-06).
 *
 * Contract AI (design.md §6.1–§6.2):
 *   `callAi("daily_plan", { system, user, schema, localContext })` từ
 *   `src/lib/ai/router.ts` → trả `AiEnvelope<T>` = `{ok:true,data,meta} | {ok:false,error}`.
 *   Router tự ghi dòng `AiCall` và tự đi fallback chain
 *   **anthropic → local → rule cục bộ**.
 *   - `schema` = structured output 6 slot (AI chỉ điền nội dung, không đổi trục).
 *   - `localContext` = ngữ cản để router dựng được bước 3 (rule cục bộ) khi
 *     không có API key / không có Ollama.
 *
 * Nếu router lỗi (chưa sẵn sàng, network…) → ta tự fallback sang
 * `generateLocalPlan` để **không bao giờ trả lỗi trần cho UI** (design.md §7.2).
 *
 * Xem tasks.md 6.2 / 6.3 / 6.4 · design.md §4.2 · FR-DL-06 · FR-AI-01.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAi } from "@/lib/ai/router";
import { prisma } from "@/lib/db";
import { applyPlanSlots, buildLocalPlanContext, generateFallbackPlan } from "@/lib/plan-helpers";
import { normalizePlanSlots } from "@/lib/plan";
import { type AiCallMeta, type PlanSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  /** true → ghi đè kế hoạch hôm nay. */
  apply: z.boolean().default(false),
});

/**
 * Schema structured output cho 6 slot.
 *
 * AI **chỉ được điền nội dung** — `domain` bị ép về giá trị trong `SLOT_TEMPLATE`
 * khi chuẩn hoá, nên AI không thể đổi cấu trúc slot (SPEC.md §2.1).
 */
const PlanSlotsSchema = z.object({
  slots: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(5),
        action: z.string().min(1).max(200),
        detail: z.string().max(240).nullable().optional(),
        minutes: z.number().int().min(5).max(120),
        skillId: z.string().nullable().optional(),
      }),
    )
    .length(6),
});

type PlanSlotsPayload = z.infer<typeof PlanSlotsSchema>;

/**
 * Meta mô tả lượt gọi AI — dùng khi AI không khả dụng.
 * Provider `local` + `fallbackFrom = "anthropic"` đúng quy ước fallback chain.
 */
function offlineMeta(reason: string): AiCallMeta {
  return {
    provider: "local",
    model: "rule-cục-bộ",
    effort: "low",
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    estimatedCost: 0,
    latencyMs: 0,
    fallbackFrom: reason,
  };
}

/**
 * System prompt — phải **tĩnh** để prefix cache của Anthropic hit
 * (design.md §6.5: cache_control đặt ở block system cuối).
 */
const SYSTEM_PROMPT = [
  "Bạn là bộ sinh kế hoạch ngày của Daily Loop OS.",
  "Bạn PHẢI trả về đúng 6 slot theo cấu trúc cố định sau (không đổi domain, không đổi số lượng slot):",
  "slot 0 = Chuyên môn (25–45 phút) · slot 1 = Giao tiếp (15–30) · slot 2 = Ngoại ngữ ôn tập SRS (10–20 phút)",
  "slot 3 = Ngoại ngữ chủ động viết/hội thoại (15–25) · slot 4 = Nhật ký (5–10) · slot 5 = Chăm sóc thể chất & tinh thần (15–30).",
  "Tiêu đề ngắn gọn, cụ thể, bằng tiếng Việt, có thể hành động ngay.",
  "`detail` tối đa 240 ký tự, mô tả cách làm cụ thể.",
  "`skillId` chỉ dùng id được cung cấp trong câu hỏi; không có thì để null.",
].join("\n");

/** Ghép ngữ cảnh ngày hôm nay (kỹ năng, thẻ đến hạn, streak) cho prompt. */
async function buildUserPrompt(): Promise<string> {
  const ctx = await buildLocalPlanContext();

  const skillLines = ctx.skills.length
    ? ctx.skills
        .map(
          (s) =>
            `- id=${s.id} | ${s.name} | domain=${s.domain} | level=${s.level}/${s.targetLevel}`,
        )
        .join("\n")
    : "- (chưa có kỹ năng nào trong cây)";

  return [
    `Ngày: ${ctx.date.toLocaleDateString("vi-VN")}.`,
    `Số thẻ SRS đến hạn: ${ctx.dueCards}.`,
    `Streak hiện tại: ${ctx.streak} ngày.`,
    `Tỷ lệ hoàn thành tuần trước: ${Math.round(ctx.lastWeekCompletion * 100)}%.`,
    "",
    "Cây kỹ năng hiện có (dùng đúng id nếu gắn skill):",
    skillLines,
  ].join("\n");
}

/**
 * Chuẩn hoá dữ liệu AI trả về → 6 slot.
 *
 * Router có thể trả về **2 shape** khác nhau:
 *   1. `{ slots: [...] }` — provider anthropic / Ollama (structured output).
 *   2. `PlanSlot[]` — bước 3 của fallback chain (rule cục bộ trong router).
 *
 * Ta nhận cả 2 để không phụ thuộc vào việc AI có sẵn hay không.
 */
function toSlots(data: unknown): PlanSlot[] {
  if (Array.isArray(data)) {
    return normalizePlanSlots(data as Array<Partial<PlanSlot> & { action?: string }>);
  }
  const parsed = PlanSlotsSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("AI trả về cấu trúc 6 slot không hợp lệ.");
  }
  return normalizePlanSlots(
    parsed.data.slots.map((s) => ({
      slot: s.slot,
      action: s.action,
      detail: s.detail ?? null,
      minutes: s.minutes,
      skillId: s.skillId ?? null,
    })),
  );
}

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
      { ok: false, error: { code: "validation", message: "Body không hợp lệ." } },
      { status: 400 },
    );
  }
  const { apply } = parsed.data;

  let slots: PlanSlot[];
  let meta: AiCallMeta;
  let usedFallback = false;

  try {
    // Ngữ cản để router dựng được bước 3 (rule cục bộ) của fallback chain.
    const localContext = await buildLocalPlanContext();
    const user = await buildUserPrompt();

    const envelope = await callAi<PlanSlotsPayload | PlanSlot[]>("daily_plan", {
      system: SYSTEM_PROMPT,
      user,
      schema: PlanSlotsSchema as unknown as z.ZodType<PlanSlotsPayload>,
      localContext,
    });

    if (!envelope.ok) {
      throw new Error(envelope.error.message || "AI không trả lời được.");
    }

    slots = toSlots(envelope.data);
    meta = envelope.meta;
  } catch (error) {
    // Không bao giờ trả lỗi trần cho UI (design.md §7.2) — luôn có kế hoạch.
    usedFallback = true;
    slots = await generateFallbackPlan();
    const reason = error instanceof Error ? error.message : "Không xác định";
    meta = offlineMeta(reason);
  }

  // `source` của slot ghi xuống DB phải khớp provider thật đã trả lời.
  const source: PlanSlot["source"] =
    !usedFallback && meta.provider === "anthropic" ? "ai" : "fallback";

  if (apply) {
    const result = await applyPlanSlots(slots, { source });
    return NextResponse.json({
      ok: true,
      data: {
        slots,
        meta,
        applied: {
          written: result.written,
          keptDone: result.keptDone,
          removed: result.removed,
        },
      },
    });
  }

  return NextResponse.json({ ok: true, data: { slots, meta } });
}

/**
 * `GET /api/plan/generate` — lượt gọi AI gần nhất của task `daily_plan`.
 *
 * Dùng cho panel thông tin AI (task 6.3) khi client cần refresh mà không
 * phải render lại cả trang.
 */
export async function GET(): Promise<NextResponse> {
  const last = await prisma.aiCall.findFirst({
    where: { feature: "daily_plan" },
    orderBy: { createdAt: "desc" },
  });

  if (!last) {
    return NextResponse.json({ ok: true, data: null });
  }

  return NextResponse.json({
    ok: true,
    data: {
      provider: last.provider === "anthropic" ? "anthropic" : "local",
      model: last.model,
      effort: "medium",
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      cacheRead: last.cacheRead,
      cacheWrite: last.cacheWrite,
      estimatedCost: last.estimatedCost,
      latencyMs: last.latencyMs,
      fallbackFrom: last.fallbackFrom,
    } satisfies AiCallMeta,
  });
}
