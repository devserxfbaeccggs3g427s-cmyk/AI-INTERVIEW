/**
 * Giải nguồn CV của request thành `ResolvedCv` — T-2.7.
 *
 * Mọi kiểm tra CV tập trung ở đây, và tất cả đều **trước** khi gọi model: một CV sai
 * mà lộ ra sau khi đã stream vài trăm token vừa tốn tiền vừa phải báo lỗi.
 *
 * Bốn nguồn trong `cvSchema` không có `file_id` thô; token đã ký là thứ duy nhất đi
 * từ trình duyệt tới chỗ chứa CV (docs/02-DESIGN.md §7.4, §7.5).
 */

import { AppError } from "../errors";
import { deleteCvUpload, loadCvUpload } from "../cv-store";
import { keyFingerprint } from "./auth";
import { capabilitiesFor } from "../providers/capabilities";
import type { ResolvedCv } from "../interview";
import type { AiConfig, ProviderAuth } from "../providers/types";
import type { CvSource } from "../schemas";
import { signCvToken } from "../token";

/** Kết quả giải CV, kèm thứ cần lưu để lượt sau dựng lại được khối CV. */
export type PreparedCv = {
  cv: ResolvedCv;
  /** CV đã thành văn bản — `sessions.cv_text` (FR-18). */
  text: string | null;
  /** Hàng `cv_uploads` đã dùng. */
  uploadId: string | null;
  /** Xoá hàng CV sau khi phiên đã ghi xong. Gọi **một** lần, không cần thành công. */
  release: () => void;
};

/** CV rỗng là CV không có. Không đẩy chuỗi rỗng vào ngữ cảnh rồi im lặng (§7.3). */
const NOTHING: PreparedCv = { cv: { kind: "none" }, text: null, uploadId: null, release: () => {} };

export async function prepareCv(source: CvSource, ai: AiConfig, auth: ProviderAuth, id: string): Promise<PreparedCv> {
  if (source.kind === "none") return NOTHING;

  if (source.kind === "text") {
    const text = source.text.trim();
    if (!text) throw new AppError("invalid_cv_token", id);
    return { cv: { kind: "text", text }, text, uploadId: null, release: () => {} };
  }

  // Nguồn `file`: token đã ký là thứ duy nhất được tin. Xác minh chữ ký **trước** khi
  // đụng tới DB, để một token bị sửa không tốn một truy vấn.
  const verified = signCvToken.verify(source.token);
  if (!verified) throw new AppError("invalid_cv_token", id);

  const upload = await loadCvUpload(verified.uploadId);
  if (!upload || upload.provider !== ai.provider || upload.model !== ai.model ||
      upload.keyFingerprint !== keyFingerprint(auth.apiKey)) {
    throw new AppError("invalid_cv_token", id);
  }

  const release = () => deleteCvUpload(upload.id);

  if (source.mode === "direct") {
    // `mode: "direct"` là lựa chọn của người dùng ở form, không phải thứ server tự
    // quyết. Model không đọc PDF thì báo lỗi; **không** lặng lẽ lùi về trích text rồi
    // giả vờ đã đọc nguyên PDF (§7.2).
    if (!capabilitiesFor(ai.provider, ai.model).readsPdf) {
      throw new AppError("unsupported_file_type", id);
    }
    if (!upload.fileId) throw new AppError("invalid_cv_token", id);
    return {
      cv: { kind: "file", mode: "direct", fileId: upload.fileId },
      text: upload.extractedText,
      uploadId: upload.id,
      release,
    };
  }

  if (!upload.extractedText) throw new AppError("pdf_no_text", id);
  return {
    cv: { kind: "file", mode: "extract", text: upload.extractedText },
    text: upload.extractedText,
    uploadId: upload.id,
    release,
  };
}