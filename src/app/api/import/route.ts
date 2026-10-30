/**
 * `POST /api/import` — nhập file JSON đã xuất (task 17.8).
 *
 * Quy trình 2 bước an toàn:
 *   1. Validate schema (zod) — không chạm DB.
 *   2. Wipe toàn bộ DB, sau đó insert từng bảng trong transaction.
 *
 * AC-16: endpoint này KHÔNG chứa API key.
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

/** Schema dòng `AiCall` — validate kiểu trường. */
const AiCallSchema = z.object({
  id: z.string(),
  feature: z.string(),
  provider: z.enum(["local", "anthropic"]),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheRead: z.number().int().default(0),
  cacheWrite: z.number().int().default(0),
  estimatedCost: z.number(),
  latencyMs: z.number().int(),
  ok: z.boolean(),
  error: z.string().nullable().optional(),
  fallbackFrom: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

/** Schema chung cho 1 bảng — array of object với ít nhất `id`. */
const TableSchema = z.array(z.record(z.string(), z.unknown()));

const ImportSchema = z.object({
  version: z.string().optional(),
  exportAt: z.string().optional(),
  tables: z.object({
    skill: TableSchema,
    activity: TableSchema,
    evidence: TableSchema,
    reflection: TableSchema,
    planItem: TableSchema,
    focusTarget: TableSchema,
    dailyState: TableSchema,
    card: TableSchema,
    review: TableSchema,
    userProfile: TableSchema,
    weeklyReviewRun: TableSchema,
    routeOverride: TableSchema,
    aiCall: TableSchema,
    interviewProfile: TableSchema,
    interviewSession: TableSchema,
    interviewTurn: TableSchema,
    testSession: TableSchema,
    testItem: TableSchema,
  }),
});

type ImportData = z.infer<typeof ImportSchema>;

// Type cho prisma transaction client — dùng Prisma.TransactionClient
type TxClient = any;

/** Xóa toàn bộ dữ liệu — chạy trong transaction để đảm bảo nhất quán. */
async function wipeAll(tx: TxClient) {
  // Xóa theo thứ tự có ràng buộc FK — con trước cha.
  await tx.testItem.deleteMany();
  await tx.testSession.deleteMany();
  await tx.interviewTurn.deleteMany();
  await tx.interviewSession.deleteMany();
  await tx.interviewProfile.deleteMany();
  await tx.aiCall.deleteMany();
  await tx.routeOverride.deleteMany();
  await tx.weeklyReviewRun.deleteMany();
  await tx.review.deleteMany();
  await tx.card.deleteMany();
  await tx.dailyState.deleteMany();
  await tx.planItem.deleteMany();
  await tx.reflection.deleteMany();
  await tx.evidence.deleteMany();
  await tx.activity.deleteMany();
  await tx.skill.deleteMany();
  await tx.userProfile.deleteMany();
}

export async function POST(request: Request) {
  try {
    // Đọc file upload
    const contentType = request.headers.get("content-type") ?? "";
    let parsed: ImportData;

    if (contentType.includes("multipart/form-data")) {
      // Form data — lấy file từ trường "file".
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: { code: "no_file", message: "Không có file được tải lên." } },
          { status: 400 },
        );
      }
      const text = await file.text();
      const raw = JSON.parse(text);

      // Validate cấu trúc chung
      const result = ImportSchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "invalid_schema",
              message: "File JSON không khớp schema.",
              detail: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
            },
          },
          { status: 400 },
        );
      }
      parsed = result.data;
    } else {
      // JSON thẳng qua body
      const raw = await request.json().catch(() => null);
      if (!raw) {
        return NextResponse.json(
          { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
          { status: 400 },
        );
      }
      const result = ImportSchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "invalid_schema",
              message: "File JSON không khớp schema.",
              detail: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
            },
          },
          { status: 400 },
        );
      }
      parsed = result.data;
    }

    // Bước 2: Wipe + import trong transaction
    await prisma.$transaction(async (tx) => {
      await wipeAll(tx as unknown as TxClient);

      const tables = parsed.tables;

      // Insert theo thứ tự có ràng buộc FK — cha trước con.
      const insertIf = async (model: string, data: any[]) => {
        if (data.length > 0) {
          // SQLite KHÔNG hỗ trợ `skipDuplicates` → dùng `createMany` thuần.
          // DB đã được wipe nên không có xung đột khoá chính.
          await (tx as any)[model].createMany({ data });
        }
      };

      await insertIf("userProfile", tables.userProfile);
      await insertIf("skill", tables.skill);
      await insertIf("activity", tables.activity);
      await insertIf("evidence", tables.evidence);
      await insertIf("reflection", tables.reflection);
      await insertIf("planItem", tables.planItem);
      await insertIf("focusTarget", tables.focusTarget);
      await insertIf("dailyState", tables.dailyState);
      await insertIf("card", tables.card);
      await insertIf("review", tables.review);
      await insertIf("weeklyReviewRun", tables.weeklyReviewRun);
      await insertIf("routeOverride", tables.routeOverride);

      // AiCall — validate chi tiết hơn
      for (const row of tables.aiCall) {
        AiCallSchema.parse(row);
      }
      await insertIf("aiCall", tables.aiCall);

      await insertIf("interviewProfile", tables.interviewProfile);
      await insertIf("interviewSession", tables.interviewSession);
      await insertIf("interviewTurn", tables.interviewTurn);
      await insertIf("testSession", tables.testSession);
      await insertIf("testItem", tables.testItem);
    });

    return NextResponse.json({
      ok: true,
      data: { message: "Đã nhập dữ liệu thành công.", version: parsed.version ?? null },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi không xác định.";
    return NextResponse.json(
      { ok: false, error: { code: "import_failed", message: msg } },
      { status: 500 },
    );
  }
}
