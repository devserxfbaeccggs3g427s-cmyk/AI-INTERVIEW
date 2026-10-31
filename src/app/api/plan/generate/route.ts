import { z } from "zod";

import { fail, toResponse } from "@/lib/api-response";
import { AiError, isAiAvailable, streamAI, type TokenUsage } from "@/lib/anthropic";
import {
  getPlanContext,
  getPlanItems,
  getStageProgress,
  mergeRegeneratedPlan,
  type PlanSlotDTO,
} from "@/lib/daily-loop";
import { SLOT_COUNT } from "@/lib/config";
import { parseDateKey, toDateKey } from "@/lib/dates";
import { generateFallbackPlan, listSkillsForPlan } from "@/lib/plan";
import { prisma } from "@/lib/db";
import {
  buildPlanSchema,
  PLAN_SLOT_CONTRACT_V1,
  PLAN_SYSTEM_V1,
  type PlanPayload,
} from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GeneratePlanBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: z.enum(["generate", "regenerate", "fallback"]).default("generate"),
  /** true = giữ slot đã done; false = sinh mới toàn bộ. */
  keepDone: z.boolean().default(true),
});

export type GeneratePlanBody = z.infer<typeof GeneratePlanBodySchema>;

/* ══ SSE ══════════════════════════════════════════════════════════════════ */

export type PlanStreamEvent =
  | { type: "slot"; slot: PlanSlotDTO }
  | {
      type: "usage";
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheRead: number;
        cacheWrite: number;
        estimatedCost: number;
        latencyMs: number;
      };
    }
  | { type: "done"; source: "ai" | "fallback"; items: PlanSlotDTO[]; keptDone: number }
  | { type: "error"; code: string; message: string };

function sse(event: PlanStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Đóng gói payload AI thành `PlanSlotDTO[]` (6 slot, domain theo vị trí). */
function payloadToSlots(payload: PlanPayload): PlanSlotDTO[] {
  return [...payload.slots]
    .sort((a, b) => a.slot - b.slot)
    .map((slot) => ({
      slot: slot.slot,
      domain: slot.domain,
      kind: SLOT_KINDS[slot.slot],
      action: slot.action,
      detail: slot.detail,
      minutes: slot.minutes,
      skillId: null, // AI trả skillName — map sang id ở bước dưới
      skillName: slot.skillName,
      done: false,
      source: "ai" as const,
    }));
}

// Nội dung slot theo vị trí — dùng để suy ra `kind` (khớp `SLOT_CONTRACTS`).
const SLOT_KINDS = ["study", "speak_write", "srs", "language", "journal", "health"] as const;

/**
 * POST /api/plan/generate — AI-01 (streaming SSE).
 *
 * ⚠️ Route này **KHÔNG** ghi `PlanItem` — duyệt là hành động riêng của người dùng
 * (FR-DL-02d). Chỉ ghi khi người dùng bấm "Duyệt & Áp dụng".
 *
 * Event: `slot` · `usage` · `done` · `error`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = GeneratePlanBodySchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")));
  }

  const dateKey = parsed.data.date ?? toDateKey(new Date());
  const date = parseDateKey(dateKey);
  if (!date) {
    return toResponse(fail("invalid_input", "invalid_date: ngày không hợp lệ"));
  }

  // ── Offline: sinh bằng rule cục bộ, không gọi AI ────────────────────────
  if (parsed.data.mode === "fallback" || !isAiAvailable()) {
    const skills = await listSkillsForPlan();
    const fallback = generateFallbackPlan(skills, { date });
    const existing = await getPlanItems(date);
    const { merged, keptDone } = mergeRegeneratedPlan(existing, fallback as PlanSlotDTO[]);

    // Ghi tạm vào DB để S01 đọc được ngay (FR-DL-07: S01 hiện kế hoạch sau khi sinh).
    await writePlanItems(date, merged, "fallback");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const slot of merged) {
          controller.enqueue(encoder.encode(sse({ type: "slot", slot })));
        }
        controller.enqueue(
          encoder.encode(
            sse({ type: "done", source: "fallback", items: merged, keptDone }),
          ),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ── Có API key: gọi AI-01 ───────────────────────────────────────────────
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage: TokenUsage | null = null;
      let sentSlots = 0;
      // Payload cuối cùng — biến CỤC BỘ trong request (không dùng module-level:
      // server xử lý nhiều request song song → biến chung sẽ lẫn dữ liệu).
      let finalPayload: PlanPayload | null = null;

      try {
        const [context, stage] = await Promise.all([
          getPlanContext(date),
          getStageProgress(),
        ]);
        const existing = await getPlanItems(date);
        const locked = context.lockedSlots;

        const system = [
          { type: "text" as const, text: PLAN_SYSTEM_V1 },
          { type: "text" as const, text: PLAN_SLOT_CONTRACT_V1, cache_control: { type: "ephemeral" as const } },
        ];

        // Toàn bộ dữ liệu biến động nằm trong `messages` (FR-DL-AI-02).
        const userContent = [
          `Ngày: ${context.date} (${context.weekday})`,
          "",
          "SINH TRẮC HÔM NAY:",
          context.dailyState
            ? `  tâm trạng ${context.dailyState.mood ?? "—"}/5 · năng lượng ${context.dailyState.energy ?? "—"}/5 · giấc ngủ ${context.dailyState.sleep ?? "—"}h · tập trung ${context.dailyState.focus ?? "—"}/5`
            : "  chưa có dữ liệu sinh trắc — coi như trung bình 3/5",
          "",
          "CÂY KỸ NĂNG (mức / bằng chứng):",
          ...context.skills.map(
            (skill) =>
              `  ${skill.id} · ${skill.name} · ${skill.domain} · level ${skill.level}/${skill.targetLevel} · ${skill.strongEvidenceCount} bằng chứng mạnh${skill.parentName ? ` · nhánh: ${skill.parentName}` : ""}`,
          ),
          "",
          "7 NGÀY GẦN NHẤT (date · slot xong/tổng · phút):",
          ...context.last7Days.map(
            (day) => `  ${day.date} · ${day.doneSlots}/${day.totalSlots} · ${day.minutes} phút`,
          ),
          "",
          locked.length > 0
            ? `RÀNG BUỘC CỐ ĐỊNH — các slot sau ĐÃ HOÀN THÀNH, TUYỆT ĐỐI không được đề xuất lại:\n${locked
                .map(
                  (slot) =>
                    `  slot ${slot.slot} (${slot.domain}) · "${slot.action}" · ${slot.minutes} phút · kỹ năng: ${slot.skillName ?? "—"}`,
                )
                .join("\n")}`
            : "RÀNG BUỘC CỐ ĐỊNH: không có slot nào đã hoàn thành hôm nay.",
          "",
          "",
          "LỘ TRÌNH HIỆN TẠI (không có deadline — dựa trên bằng chứng đã tích lũy):",
          `  Giai đoạn ${stage.stage.id} — ${stage.stage.name}`,
          `  Điều kiện đạt: ${stage.stage.criteria.condition}`,
          `  Tiêu chí đang theo đổi: ${stage.stage.criteria.criteria}`,
          `  Tốc độ hiện tại: ${stage.velocity.toFixed(1)} Evidence/ngày (${stage.evidenceCount} Evidence chuyên môn)`,
          ...(stage.shouldReduceLoad
            ? [
                "  ⚠️ Người dùng đã trượt ≥2 ngày — GIẢM TẠI: ưu tiên slot 4 (nhật ký) và slot 5 (hồi phục),",
                "  giảm thời lượng các slot chuyên môn còn lại.",
              ]
            : []),
          "",
          "Hãy sinh đủ 6 slot theo hợp đồng, ưu tiên kỹ năng có ít bằng chứng nhất trong domain của từng slot.",
        ].join("\n");

        const schema = buildPlanSchema();

        for await (const event of streamAI("AI-01", {
          system,
          messages: [{ role: "user", content: userContent }],
          schema,
          maxTokens: 4_000,
        })) {
          if (event.type === "usage") {
            usage = event.usage;
            continue;
          }

          if (event.type === "json") {
            // JSON đến dần — thử parse mỗi lần. Khi đủ 6 slot thì emit.
            try {
              const parsedPayload = schema.parse(JSON.parse(event.partial));
              finalPayload = parsedPayload;
              const slots = payloadToSlots(parsedPayload);

              if (slots.length > sentSlots) {
                for (const slot of slots.slice(sentSlots)) {
                  controller.enqueue(encoder.encode(sse({ type: "slot", slot })));
                }
                sentSlots = slots.length;
              }
            } catch {
              // JSON chưa hoàn chỉnh — chờ thêm delta.
            }
          }
        }

        // Stream kết thúc — payload cuối cùng đã validate qua schema.
        const finalSlots = finalPayload ? payloadToSlots(finalPayload) : null;
        if (finalSlots && finalSlots.length > sentSlots) {
          for (const slot of finalSlots.slice(sentSlots)) {
            controller.enqueue(encoder.encode(sse({ type: "slot", slot })));
          }
        }

        if (usage) {
          const { estimateCost } = await import("@/lib/anthropic");
          controller.enqueue(
            encoder.encode(
              sse({
                type: "usage",
                usage: {
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  cacheRead: usage.cacheRead,
                  cacheWrite: usage.cacheWrite,
                  estimatedCost: estimateCost("claude-opus-5", usage),
                  latencyMs: Date.now() - startedAt,
                },
              }),
            ),
          );
        }

        if (!finalSlots || finalSlots.length !== SLOT_COUNT) {
          controller.enqueue(
            encoder.encode(
              sse({
                type: "error",
                code: "schema_invalid",
                message: "AI không trả về đủ 6 slot hợp lệ.",
              }),
            ),
          );
          controller.close();
          return;
        }

        const { merged, keptDone } = mergeRegeneratedPlan(existing, finalSlots);

        // Ghi tạm vào DB để S01 đọc được ngay (FR-DL-07: S01 hiện kế hoạch sau khi sinh).
        // Chỉ lưu các slot chưa done (slot done đã có trong DB).
        const day = date;
        await prisma.$transaction(async (tx) => {
          // Xoá slot chưa done cũ
          await tx.planItem.deleteMany({ where: { date: day, done: false } });
          // Tạo slot mới
          await tx.planItem.createMany({
            data: merged
              .filter((item) => !item.done)
              .map((item) => ({
                date: day,
                slot: item.slot,
                domain: item.domain,
                action: item.action,
                detail: item.detail,
                minutes: item.minutes,
                skillId: item.skillId,
                done: false,
                source: "ai",
              })),
          });
        });

        controller.enqueue(
          encoder.encode(sse({ type: "done", source: "ai", items: merged, keptDone })),
        );
        controller.close();
      } catch (error) {
        const aiError =
          error instanceof AiError
            ? error
            : new AiError("unknown", String(error), "Không sinh được kế hoạch.", true, error);

        // AC-DL-6 — AI lỗi ⇒ trả fallback kèm thông báo, KHÔNG để trang trắng.
        // Client nhận `done` (source=fallback) để vẫn có 6 slot dùng được,
        // kèm `error` để hiện banner "AI lỗi, đang dùng kế hoạch offline".
        const fallbackSkills = await listSkillsForPlan();
        const fallback = generateFallbackPlan(fallbackSkills, { date });
        const current = await getPlanItems(date);
        const { merged, keptDone } = mergeRegeneratedPlan(current, fallback as PlanSlotDTO[]);
        await writePlanItems(date, merged, "fallback");

        controller.enqueue(
          encoder.encode(
            sse({ type: "error", code: aiError.code, message: aiError.userMessage }),
          ),
        );
        controller.enqueue(
          encoder.encode(sse({ type: "done", source: "fallback", items: merged, keptDone })),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Ghi 6 slot vào DB — xoá slot chưa xong, giữ nguyên slot `done`.
 *
 * Dùng cho cả 2 đường: offline mode và AI lỗi (AC-DL-6).
 */
async function writePlanItems(
  date: Date,
  items: PlanSlotDTO[],
  source: "ai" | "fallback",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.planItem.deleteMany({ where: { date, done: false } });
    await tx.planItem.createMany({
      data: items
        .filter((item) => !item.done)
        .map((item) => ({
          date,
          slot: item.slot,
          domain: item.domain,
          action: item.action,
          detail: item.detail,
          minutes: item.minutes,
          skillId: item.skillId,
          done: false,
          source,
        })),
    });
  });
}
