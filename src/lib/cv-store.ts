/**
 * Nơi CV đã tải lên sống giữa `/upload` và `/start` — T-2.5, §7.4.
 *
 * Tách khỏi `session-repo.ts` vì đây không phải dữ liệu phiên: nó là **đợt tải lên**,
 * có hạn 24 giờ và không liên quan tới phiên nào. Gộp vào repo phiên sẽ khiến
 * `GET /api/sessions` phải biết tới nó.
 *
 * `file_id` thô ở đây và **chỉ** ở đây — không vào `sessions`, không vào response,
 * không vào log (docs/02-DESIGN.md §7.5).
 */

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { io } from "next/cache";
import { getDatabase } from "./db/client";

/** Hạn 24 giờ — cùng mốc với lưới an toàn cho file ở phía provider. */
export const CV_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type CvUpload = {
  id: string;
  provider: string;
  model: string;
  /** Đường trích text — đã sẵn sàng dựng khối CV. */
  extractedText: string | null;
  /** Đường đọc thẳng. KHÔNG BAO GIỜ đưa ra ngoài server. */
  fileId: string | null;
  keyFingerprint: string;
  filename: string;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
};

export type SaveCvUpload = {
  provider: string;
  model: string;
  extractedText?: string | null;
  fileId?: string | null;
  keyFingerprint: string;
  filename: string;
  sizeBytes: number;
};

type CvUploadRow = {
  id: string; provider: string; model: string; extracted_text: string | null;
  file_id: string | null; key_fingerprint: string; filename: string;
  size_bytes: number; created_at: number; expires_at: number;
};

function hydrate(row: CvUploadRow): CvUpload {
  return {
    id: row.id, provider: row.provider, model: row.model,
    extractedText: row.extracted_text, fileId: row.file_id,
    keyFingerprint: row.key_fingerprint, filename: row.filename,
    sizeBytes: row.size_bytes, createdAt: row.created_at, expiresAt: row.expires_at,
  };
}

/**
 * Ghi một đợt tải lên và trả về hàng đã lưu (kèm `id` và mốc hết hạn).
 *
 * `id` sinh ở đây chứ không lấy từ token: token chỉ ra *điều gì* được ký, không tạo ra
 * mã định danh. Nếu để `start` chọn `id` thì nó sẽ ghi được vào bất kỳ hàng nào nó
 * muốn — đúng thứ xác thực chữ ký ngăn.
 */
export function saveCvUpload(input: SaveCvUpload, db: DatabaseSync = getDatabase()): CvUpload {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`INSERT INTO cv_uploads
    (id, provider, model, extracted_text, file_id, key_fingerprint, filename, size_bytes, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.provider, input.model, input.extractedText ?? null, input.fileId ?? null,
    input.keyFingerprint, input.filename, input.sizeBytes, now, now + CV_UPLOAD_TTL_MS,
  );
  return { id, provider: input.provider, model: input.model,
    extractedText: input.extractedText ?? null, fileId: input.fileId ?? null,
    keyFingerprint: input.keyFingerprint, filename: input.filename,
    sizeBytes: input.sizeBytes, createdAt: now, expiresAt: now + CV_UPLOAD_TTL_MS };
}

/** Nạp một đợt tải lên; hàng đã hết hạn trả `null` và bị xoá ngay. */
export async function loadCvUpload(id: string, db: DatabaseSync = getDatabase()): Promise<CvUpload | null> {
  await io();
  const row = db.prepare("SELECT * FROM cv_uploads WHERE id = ?").get(id) as CvUploadRow | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM cv_uploads WHERE id = ?").run(id);
    return null;
  }
  return hydrate(row);
}

export function deleteCvUpload(id: string, db: DatabaseSync = getDatabase()): void {
  db.prepare("DELETE FROM cv_uploads WHERE id = ?").run(id);
}

/** Xoá mọi hàng hết hạn — chạy lúc khởi động, không cần cron. */
export function purgeExpiredCvUploads(db: DatabaseSync = getDatabase()): number {
  return Number(db.prepare("DELETE FROM cv_uploads WHERE expires_at <= ?").run(Date.now()).changes);
}