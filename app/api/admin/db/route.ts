import { z } from "zod";
import { exportBackup, getBackupCounts, wipeBackupData, BackupError } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { enterMaintenance, enterOperation } from "@/lib/maintenance";
import { PRIVATE_HEADERS, privateJson, rejectCrossOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["wipe-sessions", "wipe-all", "vacuum", "backup"]) }).strict();
const MAX_ACTION_BYTES = 1024;

function errorResponse(error: unknown): Response {
  if (error instanceof BackupError) return privateJson({ ok: false, error: error.message }, { status: error.status });
  return privateJson({ ok: false, error: "Database operation failed" }, { status: 500 });
}

export async function GET() {
  try {
    return privateJson({ ok: true, dbPath: env.INTERVIEW_DB_PATH, counters: getBackupCounts() });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Only action JSON belongs here. Uploaded backup bytes use the two restore routes. */
export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;

  const length = req.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_ACTION_BYTES) {
    return privateJson({ ok: false, error: "Action request too large" }, { status: 413 });
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get("content-type") ?? "")) {
    return privateJson({ ok: false, error: "Expected application/json" }, { status: 415 });
  }

  let action: z.infer<typeof Body>["action"];
  try {
    if (!req.body) throw new Error("Missing action");
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ACTION_BYTES) {
          await reader.cancel();
          return privateJson({ ok: false, error: "Action request too large" }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    action = Body.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).action;
  } catch {
    return privateJson({ ok: false, error: "Invalid action request" }, { status: 400 });
  }

  const release = action === "backup" ? enterOperation() : enterMaintenance();
  if (!release) return privateJson({ ok: false, error: "Database is busy" }, { status: 409 });
  try {
    if (action === "backup") {
      return new Response(exportBackup(), {
        headers: {
          ...PRIVATE_HEADERS,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="interview-sessions-${Date.now()}.json"`,
        },
      });
    }
    if (action === "vacuum") {
      getDb().exec("VACUUM");
      return privateJson({ ok: true, action });
    }
    wipeBackupData(action);
    return privateJson({ ok: true, action, counters: getBackupCounts() });
  } catch (error) {
    return errorResponse(error);
  } finally {
    release();
  }
}
