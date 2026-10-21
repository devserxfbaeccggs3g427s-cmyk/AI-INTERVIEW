import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { privateJson } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row { sql: string }

export async function GET() {
  const tables = query<Row>(
    `SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name`,
  ).map((r: any) => ({ name: r.name, type: r.type } as { name: string; type: string }));

  const ddl = query<Row>(`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name`);

  return privateJson({
    ok: true,
    dbPath: env.INTERVIEW_DB_PATH,
    tables,
    ddl: ddl.map((r: any) => r.sql as string),
  });
}
