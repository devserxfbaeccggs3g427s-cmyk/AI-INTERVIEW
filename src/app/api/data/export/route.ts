import { exportAllData } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/data/export — xuất toàn bộ DB ra JSON (FR-SC-24).
 *
 * ⚠️ Chứa metadata: `schemaVersion`, `exportedAt`, `appVersion`.
 */
export async function GET(): Promise<Response> {
  const payload = await exportAllData();

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-loop-os-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
