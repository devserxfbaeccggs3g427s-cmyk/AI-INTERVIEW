/**
 * Schema ở biên endpoint DB — lớp mỏng trên `lib/schemas.ts`.
 *
 * File này **không** định nghĩa lại rule: mọi ràng buộc nằm ở `lib/schemas.ts` để
 * request của giai đoạn 2 và request của endpoint 0c không thể trôi lệch nhau. Ở đây
 * chỉ giữ hai tên mà route giai đoạn 0c đang import, để `api/settings` và
 * `api/sessions` không phải sửa theo (T-0c.5b đã kiểm chứng hành vi của hai cái đó).
 */
import { z } from "zod";
import { sessionConfigSchema, storedAiSettingsSchema } from "../schemas";

/**
 * `POST /api/settings` — `AiConfig` bỏ `persistKey`.
 *
 * Dùng bản **không có key**: `apiKey` bị `.strict()` loại, và `persistKey` cũng bị loại
 * vì nó là công tắc ở trình duyệt chứ không phải cột trong `ai_settings`
 * (docs/02-DESIGN.md §3.2). Hai trường đó lọt vào đây là `400` và hàng cũ giữ nguyên.
 */
export const settingsSchema = storedAiSettingsSchema;

/**
 * Body của `POST /api/sessions` — **chỉ có ở giai đoạn 0c**, để kiểm vòng đời
 * lưu trữ qua HTTP. Giai đoạn 2 thay bằng `POST /api/interviews/start`.
 *
 * Không dùng `cvSchema` ở đây: cột `sessions.cv_text` chỉ chứa **CV đã trích thành
 * văn bản** (FR-18), nên `null` và `""` là hai việc khác nhau — `""` là rỗng, `null` là
 * không có CV. Union ba nguồn thuộc về request mở phiên, không thuộc endpoint này.
 */
export const createSessionSchema = z.strictObject({
  ai: settingsSchema,
  config: sessionConfigSchema,
  cvText: z.string().max(20_000).nullable().optional(),
});