import { BACKUP_MAX_BYTES } from "./backup";

export class UploadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Read a JSON backup as bytes; never buffer an unbounded request body. */
export async function readRestoreUpload(req: Request): Promise<Uint8Array> {
  const contentType = req.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new UploadError("Expected application/json", 415);
  }

  const length = req.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > BACKUP_MAX_BYTES) {
    throw new UploadError("Backup exceeds size limit", 413);
  }
  if (!req.body) throw new UploadError("Missing backup", 400);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BACKUP_MAX_BYTES) throw new UploadError("Backup exceeds size limit", 413);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
