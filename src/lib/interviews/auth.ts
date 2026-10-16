/**
 * Đọc key từ header — nơi **duy nhất** làm việc đó — T-2.3.
 *
 * Vì sao không đọc `process.env` ở bất kỳ nhánh nào: nếu không, người quên dán key
 * sẽ **âm thầm** dùng key của chủ dự án. Request vẫn thành công, hoá đơn rơi vào
 * tài khoản không ai hỏi, và không có gì báo lỗi. Thiếu key phải là `401` nói thẳng.
 *
 * Header `x-provider-key`, không phải body và không phải query string: query string
 * bị ghi vào log proxy và log truy cập (docs/02-DESIGN.md §3.3).
 */

import { createHash } from "node:crypto";
import { AppError, requestId } from "../errors";
import type { ProviderAuth } from "../providers/types";

export const PROVIDER_KEY_HEADER = "x-provider-key";

/**
 * Bóc key ra khỏi header, hoặc ném `AppError` 401.
 *
 * Cắt khoảng trắng thừa: `fetch` từ trình duyệt giữ nguyên giá trị, còn người dán
 * tay trong `curl` hay trong test thường có khoảng trắng quanh — và một key có khoảng
 * trắng sẽ hỏng 401 ở phía hãng, báo cho người dùng rằng key sai khi thực ra key
 * đúng.
 */
export function authFromRequest(request: Request, id: string = requestId()): ProviderAuth {
  const raw = request.headers.get(PROVIDER_KEY_HEADER);
  const apiKey = raw?.trim() ?? "";
  if (!apiKey) throw new AppError("invalid_key", id);
  return { apiKey };
}

/**
 * Dấu vân tay của key, dùng để gắn một lần tải PDF với key đã dùng để tải.
 *
 * `sha256` cắt còn 8 byte: đủ để phân biệt hai key trên cùng máy, và **không phải**
 * là key — thiếu 24 byte thì không gọi được API nào, kể cả với người đoán trúng.
 * Ghi giá trị này xuống đĩa không vi phạm NFR-10 vì nó không khôi phục được key.
 */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}