import { z } from "zod";
import { exec, query, queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { PRIVATE_HEADERS, privateJson, rejectCrossOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Counters {
  sessions: number;
  turns: number;
  cv: number;
  evaluations: number;
  modelConfigs: number;
}

function counters(): Counters {
  const c = (sql: string) => queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`)?.n ?? 0;
  return {
    sessions: c("sessions"),
    turns: c("message_turns"),
    cv: c("cv_extracts"),
    evaluations: c("evaluations"),
    modelConfigs: c("model_configs"),
  };
}

export async function GET() {
  return privateJson({ ok: true, dbPath: env.INTERVIEW_DB_PATH, counters: counters() });
}

/* POST — admin actions: wipe, vacuum, backup, import */
const Body = z.object({
  action: z.enum(["wipe-sessions", "wipe-all", "vacuum", "backup", "import"]),
  payload: z.string().optional(),
});

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return privateJson({ ok: false, error: (e as Error).message }, { status: 400 }); }

  if (body.action === "wipe-sessions") {
    exec(`DELETE FROM sessions`); // cascades
    return privateJson({ ok: true, action: body.action, counters: counters() });
  }
  if (body.action === "wipe-all") {
    exec(`DELETE FROM sessions`);
    exec(`DELETE FROM evaluations`);
    exec(`DELETE FROM cv_extracts`);
    exec(`DELETE FROM message_turns`);
    exec(`DELETE FROM model_configs`);
    return privateJson({ ok: true, action: body.action, counters: counters() });
  }
  if (body.action === "vacuum") {
    exec(`VACUUM`);
    return privateJson({ ok: true, action: body.action });
  }
  if (body.action === "backup") {
    const sql = await exportToSql();
    return new Response(sql, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "content-type": "application/sql",
        "content-disposition": `attachment; filename="interview-sessions-${Date.now()}.sql"`,
      },
    });
  }
  if (body.action === "import") {
    if (!body.payload) return privateJson({ ok: false, error: "payload required" }, { status: 400 });
    importFromSql(body.payload);
    return privateJson({ ok: true, action: body.action, counters: counters() });
  }
  return privateJson({ ok: false, error: "unknown action" }, { status: 400 });
}

async function exportToSql(): Promise<string> {
  const tables = ["sessions", "message_turns", "cv_extracts", "evaluations", "model_configs"];
  const out: string[] = [];
  out.push(`-- AI Mock Interview Studio backup`);
  out.push(`-- generated ${new Date().toISOString()}`);
  for (const t of tables) {
    const rows = query<Record<string, unknown>>(`SELECT * FROM ${t}`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    out.push(`-- ${t} (${rows.length} rows)`);
    for (const r of rows) {
      const vals = cols.map((c) => sqlValue(r[c])).join(", ");
      out.push(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${vals});`);
    }
  }
  return out.join("\n") + "\n";
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function importFromSql(sql: string) {
  const cleaned = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) exec(stmt);
}
