/**
 * `POST /api/log/autofill` — AI-02 tự phân tích nội dung quick-log (task 5.4).
 *
 * Hợp đồng:
 *   Request : `{ text: string }`
 *   Response: `{ ok: true, data: { confidence, domain, skillId, minutes, effort, title, type }, meta }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * Router AI là file của agent khác (`src/lib/ai/router.ts`). Ta import **động**
 * với specifier ghép lúc runtime để:
 *   1. `npm run build` không vỡ khi router chưa tồn tại (webpack không phân giải
 *      module lúc build nếu specifier không phải literal).
 *   2. Khi router có mặt, hàm `callAi` thật được dùng — không cần sửa file này.
 *
 * Task `autofill` chạy **local** (`qwen2.5:7b`, 0 token) theo bảng routing
 * design.md §6.1 → hoạt động offline, không cần API key.
 *
 * ⚠️ Lỗi AI KHÔNG được làm hỏng form (AC-2 · design.md §7.2): luôn trả về
 * `{ ok: false, error }` với HTTP status hợp lý, không bao giờ throw ra ngoài.
 *
 * Xem tasks.md 5.4 · design.md §4.5 / §6.1 / §7.2.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ACTIVITY_TYPES, DOMAINS, type AiCallMeta, type Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  text: z.string().trim().min(1).max(4000),
});

/** Schema structured output — AI trả về đúng shape này (design.md §6.6). */
const AutofillSchema = z.object({
  confidence: z.number().min(0).max(1),
  domain: z.enum(DOMAINS),
  skillId: z.string().nullable(),
  minutes: z.number().int().min(0).max(600),
  /** Mức nỗ lực / độ sâu suy nghĩ — 3 mức. */
  effort: z.enum(["low", "medium", "high"]),
  title: z.string().min(1).max(200),
  type: z.enum(ACTIVITY_TYPES),
});

export type AutofillPayload = z.infer<typeof AutofillSchema>;

/**
 * Meta mô tả lượt gọi AI khi AI **không** khả dụng.
 * Provider `local` + `fallbackFrom` ghi lý do (FR-AI-11: nhãn phải phản ánh
 * provider THẬT đã trả lời — ở đây là không có provider nào trả lời).
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
 * Gọi AI Router với task `autofill`.
 *
 * Specifier được ghép lúc runtime để webpack KHÔNG phân giải module lúc build
 * (nếu phân giải thật, build fail với "Cannot find module '@/lib/ai/router'" khi
 * agent AI chưa tạo file đó). Cùng pattern với `src/app/api/plan/generate/route.ts`.
 */
async function callAutofill(text: string, skillOptions: SkillOption[]): Promise<{
  payload: AutofillPayload;
  meta: AiCallMeta;
}> {
  const specifier = ["@", "lib", "ai", "router"].join("/");
  const mod = (await import(specifier)) as {
    callAi?: (
      task: string,
      opts: { system: string; user: string; schema?: unknown },
    ) => Promise<
      | { ok: true; data: unknown; meta: AiCallMeta }
      | { ok: false; error: { code: string; message: string } }
    >;
  };

  if (typeof mod.callAi !== "function") {
    throw new Error("AI Router chưa sẵn sàng: thiếu `callAi`.");
  }

  const system = [
    "Bạn là bộ phân tích quick-log của Daily Loop OS.",
    "Đọc nội dung người dùng vừa ghi và trả về JSON đúng cấu trúc yêu cầu:",
    "- domain: professional | communication | language | personal",
    "- skillId: id của kỹ năng được liệt kê bên dưới, hoặc null nếu không khớp",
    "- minutes: thời lượng thực tế ước tính (0 nếu không rõ)",
    "- effort: low | medium | high — mức nỗ lực / độ sâu suy nghĩ",
    "- title: tiêu đề ngắn gọn ≤ 80 ký tự, bằng tiếng Việt",
    "- type: study | write | speak | roleplay | srs | journal | health | custom | mock_interview | test",
    "- confidence: 0..1 — mức chắc chắn của phân tích",
    "Không bịa thêm thông tin không có trong nội dung.",
  ].join("\n");

  const skillLines = skillOptions.length
    ? skillOptions.map((s) => `- id=${s.id} | ${s.name} | domain=${s.domain}`).join("\n")
    : "- (chưa có kỹ năng nào)";

  const user = [`Nội dung ghi nhanh: ${text}`, "", "Cây kỹ năng:", skillLines].join("\n");

  const envelope = await mod.callAi("autofill", {
    system,
    user,
    schema: AutofillSchema,
  });

  if (!envelope.ok) {
    throw new Error(envelope.error.message || "AI không trả lời được.");
  }

  const parsed = AutofillSchema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new Error("AI trả về cấu trúc không hợp lệ.");
  }

  return { payload: parsed.data, meta: envelope.meta };
}

type SkillOption = { id: string; name: string; domain: Domain };

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
      { ok: false, error: { code: "validation", message: "Nội dung ghi nhanh không hợp lệ." } },
      { status: 400 },
    );
  }

  // Danh sách kỹ năng để AI chọn `skillId` — đọc trực tiếp từ DB.
  const skills = await prisma.skill.findMany({
    select: { id: true, name: true, domain: true },
    orderBy: { position: "asc" },
    take: 60,
  });
  const skillOptions: SkillOption[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain as Domain,
  }));

  try {
    const { payload, meta } = await callAutofill(parsed.data.text, skillOptions);
    return NextResponse.json({ ok: true, data: payload, meta });
  } catch (error) {
    // AI lỗi → trả envelope lỗi, KHÔNG chặn bước 1 (AC-2 · design.md §7.2).
    const reason = error instanceof Error ? error.message : "Không xác định";
    const code = reason.includes("chưa sẵn sàng") ? "ai_unavailable" : "ai_error";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message:
            code === "ai_unavailable"
              ? "AI chưa sẵn sàng — bạn vẫn có thể điền tay các trường."
              : "AI không phân tích được nội dung này. Bạn có thể điền tay.",
        },
        meta: offlineMeta(reason.slice(0, 120)),
      },
      { status: 200 },
    );
  }
}
