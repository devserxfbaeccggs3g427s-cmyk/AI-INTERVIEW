import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { listJournal, saveJournalDraft } from "@/lib/journal";

export const dynamic = "force-dynamic";

const DraftSchema = z.object({
  /** Nội dung người dùng viết. */
  answer: z.string().min(1).max(10_000),
  /** Câu hỏi gợi ý đã dùng (tuỳ chọn). */
  prompt: z.string().max(500).optional(),
  /** id bản nháp đang sửa (null = tạo mới). */
  id: z.string().nullable().optional(),
});

/**
 * GET /api/journal?limit=&cursor=&status= — danh sách nhật ký.
 *
 * ⚠️ FR-PSJ-01 — bản nháp lưu **cục bộ**, không gọi AI. Nội dung chỉ rời
 * máy khi người dùng bấm "Gửi AI phản hồi" (FR-PSJ-03).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;
  const cursor = url.searchParams.get("cursor");
  const statusRaw = url.searchParams.get("status");

  const status = statusRaw === "draft" ? "draft" : "published";

  const result = await listJournal({ limit, cursor, status });
  return toResponse(ok(result));
}

/**
 * POST /api/journal — lưu bản nháp nhật ký (FR-PSJ-01).
 *
 * ⚠️ Bản nháp KHÔNG tạo `Activity` (P3) — nhật ký chỉ thành hoạt động khi
 * commit qua `PATCH /api/journal/[id]`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toResponse(fail("invalid_input", "Body phải là JSON hợp lệ"));
  }

  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => i.message).join("; ")),
    );
  }

  try {
    const entry = await saveJournalDraft(parsed.data);
    return toResponse(ok(entry));
  } catch (error) {
    if (error instanceof Error && error.message === "empty_answer") {
      return toResponse(fail("invalid_input", "Nội dung không được rỗng"));
    }
    throw error;
  }
}
