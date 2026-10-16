/**
 * Token CV đã ký — T-2.4.
 *
 * Token là `base64url(payload).base64url(hmac)`, payload chỉ gồm `{v, uploadId, exp}`.
 *
 * **Vì sao token không mang nội dung.** `cvSchema` giới hạn `token` ở 512 ký tự,
 * còn text CV có thể tới 20.000 — nên token chỉ có thể mang một *tham chiếu*. Và
 * tham chiếu tới phải là `uploadId` ngẫu nhiên trong bảng `cv_uploads`, không phải
 * `file_id` thô của hãng: file thuộc workspace của key, đưa nó vào body là đường
 * đọc chéo tệp giữa những người dùng khác (docs/02-DESIGN.md §7.5).
 *
 * **Vì sao khoá không đọc từ `process.env`.** Cùng lý do với key của provider: biến
 * môi trường sót lại thành đường lấy dữ liệu ngoài ý muốn, và nó cho phép kẻ khác
 * chọn khoá ký bằng cách đặt biến môi trường. Hệ quả được chấp nhận và nêu thẳng:
 * token đã phát ra mất hiệu lực sau khi restart server, người dùng tải lại CV. Đó là
 * một lần tải lại tệp, không phải mất dữ liệu phiên.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Sinh một lần lúc module nạp — tức một lần mỗi tiến trình Node. */
const SIGNING_KEY = randomBytes(32);

/** Cho phép test dùng khoá khác để chứng minh "ký bằng khoá khác → thất bại". */
export function tokenSigner(secret: Buffer = SIGNING_KEY) {
  return {
    sign(uploadId: string, expiresAt: number): string {
      const payload = encode({ v: 1, uploadId, exp: expiresAt });
      return `${payload}.${sign(payload, secret)}`;
    },
    verify(token: string): { uploadId: string; exp: number } | null {
      const parts = token.split(".");
      if (parts.length !== 2) return null;
      const [payload, signature] = parts as [string, string];
      // So khớp kiểu trước khi gọi `timingSafeEqual`: hàm này ném nếu hai mảng
      // khác độ dài, nên kiểm độ dài trước là bắt buộc chứ không phải tối ưu.
      const expected = sign(payload, secret);
      const given = Buffer.from(signature, "utf8");
      const want = Buffer.from(expected, "utf8");
      if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
      const parsed = decode(payload);
      if (!parsed || typeof parsed.exp !== "number" || typeof parsed.uploadId !== "string") {
        return null;
      }
      // Hết hạn kiểm ở đây chứ không ở nơi dùng: một token hết hạn là token không
      // tồn tại, và hai chỗ kiểm nghĩa là hai chỗ có thể quên.
      if (parsed.exp * 1000 <= Date.now()) return null;
      return { uploadId: parsed.uploadId, exp: parsed.exp };
    },
  };
}

export const signCvToken = tokenSigner();

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(payload: string): { v?: unknown; uploadId?: unknown; exp?: unknown } | null {
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Hạn 24 giờ — cùng mốc với lưới an toàn cho file tồn ở phía provider (§7.5). */
export const CV_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Mã định danh upload: 16 byte ngẫu nhiên, đủ mạnh để không dò ra trong 24h. */
export function newUploadId(): string {
  return randomBytes(16).toString("hex");
}