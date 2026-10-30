/**
 * `POST /api/review/weekly` — AI-07: tổng kết tuần + đề xuất 6 slot tuần sau (S13).
 *
 * Nhận được dữ liệu tổng hợp tuần (WeeklySummary + WeeklyComparison) qua body,
 * gọi AI để sinh:
 *   - 3 nhận định (1 điểm mạnh / 1 cần sửa / 1 nên thử) — task 15.4
 *   - 6 slot (hoặc 3 slot khi giảm tải) cho tuần sau — task 15.5
 *
 * Logic:
 *   1. Parse body JSON (WeeklySummary + WeeklyComparison + reliefNote + slotCount)
 *   2. Xây dựng user message tĩnh (không có Date.now/Math.random — FR-AI-09)
 *   3. Gọi `callAi("weekly_review", { system, user, schema, effort: "high" })`
 *      — effort "high" được định nghĩa sẵn trong ROUTES (task 15.3)
 *   4. Ghi cờ `WeeklyReviewRun.weekKey` qua `ensureWeeklyRun` để không chạy 2 lần
 *   5. Trả về envelope `{ ok: true, data: { insights, slots, meta } }`
 *
 * Xem tasks.md 15.2 / 15.3 / 15.6 · design.md §4.13 · FR-WR-05.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import "server-only";
import { prisma } from "@/lib/db";
import { callAi, aiErrorStatus } from "@/lib/ai/router";
import { ensureWeeklyRun } from "@/lib/weekly";
import { SYSTEM_PROMPT_V1, TASK_PROMPT_WEEKLY_REVIEW } from "@/lib/prompts";
import type { AiEnvelope } from "@/lib/types";
import type { WeeklySummary, WeeklyComparison } from "@/lib/weekly";

import type { Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Schema structured output của AI-07. */
const InsightSchema = z.object({
  /** "good" = điểm mạnh, "fix" = cần sửa, "try" = nên thử. */
  type: z.enum(["good", "fix", "try"]),
  text: z.string().min(1).max(300),
});

const SlotSchema = z.object({
  slot: z.number().int().min(0).max(5),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  action: z.string().min(1).max(200),
  detail: z.string().max(240).nullable(),
  minutes: z.number().int().min(1).max(120),
  skillId: z.string().nullable(),
});

const WeeklyReviewResultSchema = z.object({
  insights: z.array(InsightSchema).length(3),
  slots: z.array(SlotSchema).min(3).max(6),
});

type WeeklyReviewResult = z.infer<typeof WeeklyReviewResultSchema>;

/** Body nhận từ client — dữ liệu tổng hợp tuần + trạng thái giảm tải. */
const RequestBody = z.object({
  summary: z.object({
    weekKey: z.string(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    activityCount: z.number().int(),
    totalMinutes: z.number().int(),
    planDone: z.number().int(),
    planTotal: z.number().int(),
    completionRate: z.number(),
    domainCounts: z.record(z.string(), z.number()),
    domainMinutes: z.record(z.string(), z.number()),
    topSkills: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        count: z.number().int(),
        minutes: z.number().int(),
      }),
    ),
    avgMood: z.number().nullable(),
    avgSleep: z.number().nullable(),
    avgEnergy: z.number().nullable(),
    stateDays: z.number().int(),
    srsReviews: z.number().int(),
    dueCards: z.number().int(),
    missedDays: z.number().int(),
    needsRelief: z.boolean(),
  }),
  previous: z
    .object({
      activityCount: z.number().int(),
      totalMinutes: z.number().int(),
      planDone: z.number().int(),
      planTotal: z.number().int(),
      completionRate: z.number(),
      avgMood: z.number().nullable(),
      avgSleep: z.number().nullable(),
      evidenceCount: z.number().int(),
    })
    .nullable(),
  reliefNote: z.string().nullable().optional(),
  slotCount: z.number().int().min(0).optional(),
  weekKey: z.string(),
});

type RequestData = z.infer<typeof RequestBody>;

/**
 * Xây dựng user message cho AI — dữ liệu động chỉ nằm ở đây, không trong system.
 *
 * Định dạng: JSON được đưa dưới dạng text để AI dễ parse, kèm hướng dẫn chi tiết.
 */
function buildUserMessage(data: RequestData): string {
  const s = data.summary;
  const p = data.previous;
  const reliefNote = data.reliefNote ?? null;
  const slotCount = data.slotCount ?? (s.needsRelief ? 3 : 6);

  const prevSection = p
    ? `
Tuần trước so sánh:
- Hoạt động: ${p.activityCount} (${(p.totalMinutes || 0).toFixed(0)} phút) | Kế hoạch: ${p.planDone}/${p.planTotal} (${(p.completionRate * 100).toFixed(1)}%)
- Mood trung bình: ${p.avgMood ?? "chưa có dữ liệu"} | Sleep trung bình: ${p.avgSleep ?? "chưa có dữ liệu"}h
- Bằng chứng thu thập: ${p.evidenceCount}`
    : `\nTuần trước: chưa có dữ liệu so sánh.`;

  const reliefSection = reliefNote
    ? `\nLưu ý giảm tải (FR-WR-05): ${reliefNote} → Đề xuất ${slotCount} slot.`
    : "";

  const topSkillsText =
    s.topSkills.length > 0
      ? s.topSkills
          .map((sk) => `  - ${sk.name}: ${sk.count} hoạt động, ${(sk.minutes || 0)} phút`)
          .join("\n")
      : "  (chưa có kỹ năng nổi bật)";

  const domainText = s.domainCounts
    ? Object.entries(s.domainCounts)
        .map(([d, c]) => `  - ${d}: ${c} hoạt động, ${(s.domainMinutes[d] || 0)} phút`)
        .join("\n")
    : "  (chưa có dữ liệu)";

  return [
    "DỮ LIỆU TỔNG HỢP TUẦN HIỆN TẠI:",
    `Tuần: ${s.weekKey}`,
    `- Hoạt động: ${s.activityCount} (${(s.totalMinutes || 0)} phút)`,
    `- Kế hoạch: ${s.planDone}/${s.planTotal} (${(s.completionRate * 100).toFixed(1)}% hoàn thành)`,
    `- Trượt liên tiếp: ${s.missedDays} ngày → ${s.needsRelief ? "CẦN GIẢM TẢI" : "không giảm tải"}`,
    "",
    "Phân bổ 4 domain:",
    domainText,
    "",
    "Top 3 kỹ năng:",
    topSkillsText,
    "",
    "Sinh trắc học tuần:",
    `- Mood TB: ${s.avgMood ?? "chưa có dữ liệu"} / 5`,
    `- Sleep TB: ${s.avgSleep ?? "chưa có dữ liệu"}h`,
    `- Energy TB: ${s.avgEnergy ?? "chưa có dữ liệu"} / 5`,
    `- SRS: ${s.srsReviews} lượt ôn | ${s.dueCards} thẻ đến hạn`,
    prevSection,
    reliefSection,
    "",
    `YÊU CẦU:`,
    "1. Phân tích 3 nhận định: 1 điểm mạnh (type=good), 1 cần sửa (type=fix), 1 nên thử (type=try).",
    `2. Đề xuất ${slotCount} slot cho tuần sau theo cấu trúc cố định:`,
    "   slot 0 = Chuyên môn (25-45'), slot 1 = Giao tiếp (15-30'), slot 2 = Ngoại ngữ SRS (10-20')",
    "   slot 3 = Ngoại ngữ chủ động (15-25'), slot 4 = Nhật ký (5-10'), slot 5 = Cá nhân (15-30').",
    "   Khi giảm tải: chỉ trả về 3 slot (0, 1, 2) và bỏ qua slot 3, 4, 5.",
    "3. mỗi slot: action ngắn gọn, detail tối đa 240 ký tự, minutes phù hợp domain.",
    "4. skillId chỉ dùng id từ topSkills ở trên; không có thì để null.",
    "5. Trả về JSON duy nhất, không có chú thích.",
  ].join("\n");
}

/**
 * `POST /api/review/weekly` — gọi AI-07 sinh tổng kết tuần + đề xuất slot.
 *
 * Effort "high" đã được định nghĩa sẵn trong ROUTES.weekly_review (task 15.3).
 * Ghi cờ WeeklyReviewRun để đảm bảo Weekly Review không chạy 2 lần/tuần (task 15.2).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let data: RequestData;
  try {
    const raw = await request.json();
    data = RequestBody.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: e.issues[0]?.message || "Invalid input" } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  // Xây dựng prompt — system tĩnh, user message chứa dữ liệu động.
  const system = [SYSTEM_PROMPT_V1, "", TASK_PROMPT_WEEKLY_REVIEW].join("\n");
  const user = buildUserMessage(data);

  // Gọi AI với schema structured output — effort "high" nằm trong ROUTES rồi.
  const aiResult: AiEnvelope<WeeklyReviewResult> = await callAi("weekly_review", {
    system,
    user,
    schema: WeeklyReviewResultSchema,
  });

  if (!aiResult.ok) {
    return NextResponse.json(
      { ok: false, error: aiResult.error },
      { status: aiErrorStatus(aiResult.error.code) },
    );
  }

  // Ghi cờ weekly run để không chạy 2 lần (task 15.2) + lưu reliefNote/slotCount.
  const slotCount = aiResult.data.slots.length;
  await ensureWeeklyRun(data.summary.weekKey, {
    slotCount,
    reliefNote: data.reliefNote ?? null,
  });

  return NextResponse.json({
    ok: true,
    data: {
      insights: aiResult.data.insights,
      slots: aiResult.data.slots,
    },
    meta: aiResult.meta,
  });
}
