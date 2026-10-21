import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BackupCounts, BackupRevision } from "./backup";

const TTL_MS = 5 * 60 * 1000;
const MAX_TOKENS = 128;

type RestorePreview = {
  digest: Buffer;
  /** Database revision the operator saw; re-checked inside the restore transaction. */
  revision: BackupRevision;
  expiresAt: number;
};

const previews = new Map<string, RestorePreview>();

function prune(now: number): void {
  for (const [token, preview] of previews) {
    if (preview.expiresAt <= now) previews.delete(token);
  }
  while (previews.size >= MAX_TOKENS) previews.delete(previews.keys().next().value!);
}

function digest(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

/** Keep only a digest and a revision, never uploaded CVs, turns, or reports. */
export function issueRestoreToken(bytes: Uint8Array, revision: BackupRevision): { token: string; expiresAt: number } {
  const now = Date.now();
  prune(now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + TTL_MS;
  previews.set(token, {
    digest: digest(bytes),
    revision: { counts: { ...revision.counts }, fingerprint: revision.fingerprint },
    expiresAt,
  });
  return { token, expiresAt };
}

/** One use even if the subsequent restore fails; a new preview is then required. */
export function consumeRestoreToken(token: string, bytes: Uint8Array): BackupRevision | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const preview = previews.get(token);
  if (!preview) return null;
  previews.delete(token);
  if (preview.expiresAt <= Date.now() || !timingSafeEqual(preview.digest, digest(bytes))) return null;
  return preview.revision;
}
