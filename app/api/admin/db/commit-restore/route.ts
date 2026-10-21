import { BackupError, countsMatch, getBackupCounts, parseBackup, restoreBackup } from "@/lib/backup";
import type { BackupRevision } from "@/lib/backup";
import { env } from "@/lib/env";
import { enterMaintenance } from "@/lib/maintenance";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { consumeRestoreToken } from "@/lib/restore-token";
import { readRestoreUpload, UploadError } from "@/lib/restore-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cheap fail-fast before taking the lease. The authoritative check is transactional. */
function matchesCurrent(revision: BackupRevision): boolean {
  return countsMatch(getBackupCounts(), revision.counts);
}

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;

  const token = req.headers.get("x-restore-token");
  if (!token) return privateJson({ ok: false, error: "Missing restore token" }, { status: 400 });

  try {
    const bytes = await readRestoreUpload(req);
    const revision = consumeRestoreToken(token, bytes);
    if (!revision) return privateJson({ ok: false, error: "Invalid or expired restore token" }, { status: 409 });
    const data = parseBackup(bytes); // Recheck schema/version, not just the upload digest.
    // Cheap pre-check so a stale preview fails before taking the maintenance lease.
    if (!matchesCurrent(revision)) {
      return privateJson({ ok: false, error: "Database changed since validation" }, { status: 409 });
    }
    const release = enterMaintenance();
    if (!release) return privateJson({ ok: false, error: "Database is busy" }, { status: 409 });
    try {
      // restoreBackup re-checks the revision inside BEGIN IMMEDIATE, where SQLite's
      // write lock makes the comparison and the replacement a single atomic step.
      restoreBackup(data, revision);
      return privateJson({ ok: true, counters: getBackupCounts() });
    } finally {
      release();
    }
  } catch (error) {
    if (error instanceof BackupError || error instanceof UploadError) {
      return privateJson({ ok: false, error: error.message }, { status: error.status });
    }
    return privateJson({ ok: false, error: "Backup restore failed" }, { status: 500 });
  }
}
