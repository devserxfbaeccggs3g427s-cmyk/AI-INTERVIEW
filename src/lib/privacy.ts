import { prisma } from "@/lib/db";

/**
 * Minh bạch dữ liệu (FR-SC-27) — tách riêng khỏi `settings.ts`.
 *
 * ⚠️ P6 — "Dữ liệu nào đã rời máy" là câu hỏi bắt buộc của một app
 * local-first. Nhật ký này chỉ liệt kê dòng `AiCall` **thực sự đã gửi**
 * dữ liệu, không đếm lần gọi AI rỗng — nếu không thì con số sẽ đẹp hơn
 * thực tế.
 */

export interface PrivacyLogEntry {
  id: string;
  createdAt: string;
  feature: string;
  model: string;
  /** Loại dữ liệu đã gửi — JSON array (C12). */
  dataKinds: string[];
  dataPreview: string | null;
  estimatedCost: number;
}

/**
 * Nhật ký "dữ liệu nào đã gửi lên API" (FR-SC-27).
 */
export async function listPrivacyLog(
  limit = 100,
): Promise<PrivacyLogEntry[]> {
  const rows = await prisma.aiCall.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(1, limit)),
    select: {
      id: true,
      createdAt: true,
      feature: true,
      model: true,
      dataKinds: true,
      dataPreview: true,
      estimatedCost: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    feature: row.feature,
    model: row.model,
    dataKinds: parseDataKinds(row.dataKinds),
    dataPreview: row.dataPreview,
    estimatedCost: row.estimatedCost,
  }));
}

/** Parse `dataKinds` (JSON array) — trả `[]` nếu lỗi. */
export function parseDataKinds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
