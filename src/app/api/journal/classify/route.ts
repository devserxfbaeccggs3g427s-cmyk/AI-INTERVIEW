/**
 * `POST /api/journal/classify` — AI-06 phân loại nhật ký (tasks.md 12.5 · S06).
 *
 * Hợp đồng:
 *   Request : `{ content: string }`
 *   Response: `{ ok: true, data: { domain, skillName, skillId, confidence }, meta: AiCallMeta }`
 *            | `{ ok: false, error: { code: string, message: string } }`
 *
 * Provider: **local** (`qwen2.5:7b`, 0 token) theo bảng định tuyến
 * design.md §6.1 → chạy offline, không tốn token. Route gọi qua
 * `lib/ai/router.ts` (`callAi("classify", …)`) — **không** gọi Ollama trực tiếp,
 * không hardcode provider.
 *
 * Badge hiển thị ở UI (`Local · qwen2.5:7b`) được dựng từ `meta.provider` +
 * `meta.model` — xem `providerModelLabel` trong `src/lib/journal.ts`.
 *
 * ⚠️ Privacy (FR-PS-07): chỉ chạy khi người dùng bấm nút "Phân loại".
 *
 * Xem tasks.md 12.5 · design.md §4.6 / §6.1 / §6.9 · FR-AI-20.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAi } from "@/lib/ai/router";
import { prisma } from "@/lib/db";
import { JOURNAL_MAX_LENGTH } from "@/lib/journal";
import { SYSTEM_PROMPT_V1 } from "@/lib/prompts";
import { DOMAINS, type Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  content: z.string().trim().min(1).max(JOURNAL_MAX_LENGTH),
});

/**
 * Schema structured output của AI-06.
 *
 * `skillName` là **tên** skill (không phải id) vì model local nhỏ không biết id
 * nội bộ; server resolve tên → id qua cây kỹ năng (xem `resolveSkill`).
 */
const ClassifySchema = z
  .object({
    domain: z.enum(DOMAINS),
    skillName: z.string().nullable(),
    /** 0–100. */
    confidence: z.number().min(0).max(100),
  })
  .strict();

type ClassifyPayload = z.infer<typeof ClassifySchema>;

/**
 * System prompt — **tĩnh** (FR-AI-09). Danh sách skill động nằm ở user
 * message để prefix cache không bao giờ vỡ.
 */
const SYSTEM_PROMPT = [
  SYSTEM_PROMPT_V1,
  "",
  "Nhiệm vụ lần này — phân loại nhật ký (AI-06):",
  "Trả về ĐÚNG 3 field: `domain`, `skillName`, `confidence`.",
  "`domain`: một trong professional | communication | language | personal.",
  "`skillName`: tên kỹ năng phù hợp nhất trong danh sách được cung cấp, hoặc null nếu không khớp.",
  "`confidence`: số 0–100 — mức chắc chắn.",
  "Không thêm field nào khác, không giải thích thêm.",
].join("\n");

/**
 * Resolve tên skill → `skillId` trong cây kỹ năng.
 *
 * Khớp không phân biệt hoa/thường; ưu tiên skill cùng `domain` trước.
 * Trả `null` nếu không tìm thấy — UI sẽ hiện "chưa gắn skill nào".
 */
async function resolveSkill(
  skillName: string | null,
  domain: Domain,
): Promise<{ id: string; name: string } | null> {
  if (!skillName) return null;
  const trimmed = skillName.trim();
  if (!trimmed) return null;

  const skills = await prisma.skill.findMany({
    select: { id: true, name: true, domain: true },
    orderBy: { position: "asc" },
  });

  const target = trimmed.toLowerCase();
  const exact = skills.find((s) => s.name.toLowerCase() === target);
  if (exact) return { id: exact.id, name: exact.name };

  const sameDomain = skills.filter((s) => s.domain === domain);
  const partial =
    sameDomain.find((s) => s.name.toLowerCase().includes(target)) ??
    skills.find((s) => s.name.toLowerCase().includes(target));
  return partial ? { id: partial.id, name: partial.name } : null;
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
      {
        ok: false,
        error: {
          code: "validation",
          message: "Nội dung nhật ký không hợp lệ hoặc quá dài.",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  // Danh sách skill để AI chọn tên — đọc trực tiếp từ DB.
  const skills = await prisma.skill.findMany({
    select: { id: true, name: true, domain: true },
    orderBy: { position: "asc" },
    take: 80,
  });
  const skillLines = skills.length
    ? skills.map((s) => `- ${s.name} (domain=${s.domain})`).join("\n")
    : "- (chưa có kỹ năng nào)";

  const envelope = await callAi<ClassifyPayload>("classify", {
    system: SYSTEM_PROMPT,
    user: [
      "Nội dung nhật ký:",
      '"""',
      parsed.data.content,
      '"""',
      "",
      "Cây kỹ năng hiện có:",
      skillLines,
      "",
      "Trả về đúng 3 field: `domain`, `skillName`, `confidence`.",
    ].join("\n"),
    schema: ClassifySchema,
    effort: "low",
  });

  if (!envelope.ok) {
    return NextResponse.json(
      { ok: false, error: { code: envelope.error.code, message: envelope.error.message } },
      { status: 502 },
    );
  }

  const domain = envelope.data.domain as Domain;
  const skill = await resolveSkill(envelope.data.skillName, domain);

  return NextResponse.json({
    ok: true,
    data: {
      domain,
      skillName: skill?.name ?? envelope.data.skillName ?? null,
      skillId: skill?.id ?? null,
      confidence: Math.round(envelope.data.confidence),
    },
    meta: envelope.meta,
  });
}
