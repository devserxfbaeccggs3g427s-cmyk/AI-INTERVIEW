import { BackupError, getBackupCounts, getBackupFingerprint, parseBackup } from "@/lib/backup";
import { env } from "@/lib/env";
import { enterOperation } from "@/lib/maintenance";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";
import { issueRestoreToken } from "@/lib/restore-token";
import { readRestoreUpload, UploadError } from "@/lib/restore-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;

  try {
    const bytes = await readRestoreUpload(req);
    const data = parseBackup(bytes);
    const release = enterOperation();
    if (!release) return privateJson({ ok: false, error: "Database is busy" }, { status: 409 });
    try {
      // Both reads share this lease, so the preview reflects one database state.
      const revision = { counts: getBackupCounts(), fingerprint: getBackupFingerprint() };
      const { token, expiresAt } = issueRestoreToken(bytes, revision);
      return privateJson({
        ok: true, token, expiresAt,
        incomingCounts: data.counts, currentCounts: revision.counts,
        revision: revision.fingerprint.slice(0, 12),
      });
    } finally {
      release();
    }
  } catch (error) {
    if (error instanceof BackupError || error instanceof UploadError) {
      return privateJson({ ok: false, error: error.message }, { status: error.status });
    }
    return privateJson({ ok: false, error: "Backup validation failed" }, { status: 400 });
  }
}
