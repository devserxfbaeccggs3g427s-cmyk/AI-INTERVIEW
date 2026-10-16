/**
 * Chuẩn hoá `Usage` về một hình dạng — T-0b.9.
 *
 * Điểm quan trọng: `cacheRead`/`cacheWrite` là `number | null`, **không** phải `0`.
 * Provider không báo cache thì `null` và UI hiển thị "—". Ghi `0` sẽ khiến giao diện
 * hiện một con số đo được mà thực tế không có phép đo nào — đúng kiểu tự dối dạng mà
 * toàn bộ phần cache của thiết kế này đang cố tránh.
 */

import type { Usage } from "./providers/types";

/** Trường không có số nào hữu nghĩa: dùng `null` để phân biệt "không đo" với "đo ra 0". */
function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function required(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeUsage(raw: Partial<Usage>): Usage {
  return {
    input: required(raw.input),
    output: required(raw.output),
    cacheRead: numberOrNull(raw.cacheRead),
    cacheWrite: numberOrNull(raw.cacheWrite),
  };
}

/**
 * Tổng token đầu vào đã trả tiền.
 *
 * Với provider có cache, `input` đã bao gồm phần đọc cache — cộng thêm lần nữa sẽ
 * thổi phóng to chi phí. Vì vậy hàm này chỉ dùng khi cần con số hiển thị cho người
 * dùng, không dùng để tính tiền.
 */
export function totalInputTokens(usage: Usage): number {
  return usage.input;
}

/** Số liệu cache hiển thị được, hoặc `null` để UI in ra "—". */
export function cacheCell(usage: Usage): {
  read: number | null;
  write: number | null;
  available: boolean;
} {
  const read = numberOrNull(usage.cacheRead);
  const write = numberOrNull(usage.cacheWrite);
  return { read, write, available: read !== null || write !== null };
}