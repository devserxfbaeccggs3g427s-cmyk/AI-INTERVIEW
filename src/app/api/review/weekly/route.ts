import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { AiError, isAiAvailable, streamAI } from "@/lib/anthropic";
import { getWeeklySummary } from "@/lib/analytics";
import { STABLE_SYSTEM } from "@/lib/prompts";
import {
  buildNextWeekPlan,
  buildWeeklyUserMessage,
  fillMissingSlots,
  getStoredInsights,
  RUBRIC_WEEKLY,
  saveWeeklyInsights,
  WEEKLY_REVIEW_SYSTEM,
  WeeklyReviewSchema,
  type NextWeekPlan,
  type WeeklyInsights,
} from "@/lib/weekly-review";
import { currentIsoWeek, isValidIsoWeek, lastCompletedWeek } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const QuerySchema = z.object({
  week: z.string().optional(),
});

const BodySchema = z.object({
  week: z.string().optional(),
});

export type WeeklyStreamEvent =
  | { type: "insight"; insights: WeeklyInsights }
  | { type: "plan"; plan: NextWeekPlan; warning: string | null }
  | {
      type: "done";
      insights: WeeklyInsights | null;
      plan: NextWeekPlan | null;
      warning: string | null;
    }
  | { type: "error"; code: string; message: string };

function ndjson(event: WeeklyStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * GET /api/review/weekly?week=2026-W43 — số liệu tuần (S13).
 *
 * ⚠️ Mặc định `week` = tuần đã chốt gần nhất (Chủ Nhật 20:00).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    week: url.searchParams.get("week") ?? undefined,
  });

  if (!parsed.success) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  const week = parsed.data.week ?? lastCompletedWeek();
  if (!isValidIsoWeek(week)) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  const summary = await getWeeklySummary(week);
  if (!summary) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  const stored = await getStoredInsights(week);

  return toResponse(
    ok({
      ...summary,
      currentWeek: currentIsoWeek(),
      isDue: lastCompletedWeek() === week,
      storedInsights: stored?.insights ?? null,
      storedPlan: stored?.plan ?? null,
    }),
  );
}

/**
 * POST /api/review/weekly — AI-07 (streaming NDJSON).
 *
 * ⚠️ Thiếu API key ⇒ `503` — **không** giả lập nhận định AI.
 * ⚠️ Schema sai ⇒ `insights: null` + `warning`, **không** 500 (design.md §5).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  const week = parsed.success ? (parsed.data.week ?? currentIsoWeek()) : currentIsoWeek();

  if (!isValidIsoWeek(week)) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  if (!isAiAvailable()) {
    return toResponse(
      fail("no_api_key", "Bật nhận định AI bằng cách thêm API key trong Cài đặt"),
    );
  }

  const summary = await getWeeklySummary(week);
  if (!summary) {
    return toResponse(fail("invalid_input", "Tuần không hợp lệ — dùng định dạng 2026-W43"));
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let partial = "";
      let payload: ReturnType<typeof WeeklyReviewSchema.parse> | null = null;

      try {
        const system = [
          { type: "text" as const, text: STABLE_SYSTEM },
          { type: "text" as const, text: WEEKLY_REVIEW_SYSTEM },
          {
            type: "text" as const,
            text: RUBRIC_WEEKLY,
            cache_control: { type: "ephemeral" as const },
          },
        ];

        const userContent = buildWeeklyUserMessage(summary, week);

        for await (const event of streamAI("AI-07", {
          system,
          messages: [{ role: "user", content: userContent }],
          schema: WeeklyReviewSchema,
          maxTokens: 8_000,
        })) {
          if (event.type !== "json") continue;
          partial = event.partial;
          try {
            payload = WeeklyReviewSchema.parse(JSON.parse(partial));
          } catch {
            // JSON chưa hoàn chỉnh — chờ delta tiếp theo.
          }
        }

        if (!payload) {
          // Stream kết thúc mà JSON chưa đủ ⇒ parse lần cuối để báo lỗi.
          let finalData: unknown = null;
          try {
            finalData = JSON.parse(partial);
          } catch {
            finalData = null;
          }
          const parsedFinal = WeeklyReviewSchema.safeParse(finalData);
          if (!parsedFinal.success) {
            controller.enqueue(
              encoder.encode(
                ndjson({
                  type: "error",
                  code: "schema_invalid",
                  message: "Kế hoạch AI không hợp lệ — bạn có thể tự chỉnh sửa.",
                }),
              ),
            );
            controller.enqueue(
              encoder.encode(
                ndjson({ type: "done", insights: null, plan: null, warning: "schema_invalid" }),
              ),
            );
            controller.close();
            return;
          }
          payload = parsedFinal.data;
        }

        const insights: WeeklyInsights = payload.insights;
        const { plan: rawPlan, warning } = buildNextWeekPlan(payload);
        const plan = fillMissingSlots(rawPlan);

        controller.enqueue(encoder.encode(ndjson({ type: "insight", insights })));
        controller.enqueue(encoder.encode(ndjson({ type: "plan", plan, warning })));

        await saveWeeklyInsights({ week, insights, plan });

        controller.enqueue(
          encoder.encode(ndjson({ type: "done", insights, plan, warning })),
        );
        controller.close();
      } catch (error) {
        const aiError = error instanceof AiError ? error : null;
        controller.enqueue(
          encoder.encode(
            ndjson({
              type: "error",
              code: aiError?.code ?? "unknown",
              message:
                aiError?.userMessage ?? "AI không phản hồi — số liệu vẫn hiển thị bên trên.",
            }),
          ),
        );
        controller.enqueue(
          encoder.encode(
            ndjson({ type: "done", insights: null, plan: null, warning: "ai_error" }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
