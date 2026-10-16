/**
 * Schema Zod cho mọi body request — T-1.1.
 *
 * Ba quy tắc của file này, không ngoại lệ:
 *
 *   1. Mọi object đều `.strict()`: trường lạ là **lỗi**, không phải bỏ qua im lặng.
 *      Đó là thứ giữ `apiKey` trong body khỏi bảng `ai_settings` (NFR-10, T-0c.5b) —
 *      `POST /api/settings` có `apiKey` phải trả 400, hàng cũ giữ nguyên.
 *   2. **Không** schema nào ở đây chứa `apiKey`. Key đi qua header `x-provider-key`
 *      và sống trong tham số lời gọi adapter (docs/02-DESIGN.md §3.1, §3.3).
 *   3. File nằm trong đồ thị import của **cả** trình duyệt lẫn route handler, nên chỉ
 *      import `zod` và *kiểu* từ `providers/types` — không import SDK hãng nào.
 */

import { z } from "zod";
import type {
  AiConfig,
  CallMode,
  Language,
  ProviderId,
  ReasoningLevel,
} from "./providers/types";

/*
 * Enum ở đây lặp lại giá trị đã có trong `providers/types.ts`. Sự lệch là lỗi biên dịch
 * nhờ các `Assert` bên dưới, chứ không phải lỗi im lặng lúc chạy: một provider mới lọt
 * vào kiểu mà không lọt vào schema sẽ khiến `npm run typecheck` đỏ trước khi ai chạy app.
 */
export const providerIdSchema = z.enum(["anthropic", "openai", "gemini", "custom"]);
export const reasoningLevelSchema = z.enum(["off", "low", "medium", "high"]);
export const callModeSchema = z.enum(["proxy", "direct"]);
export const languageSchema = z.enum(["vi", "en"]);
export const modeSchema = z.enum(["strict", "coaching"]);
export const lengthSchema = z.enum(["short", "medium", "long"]);

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type _ProviderIdInSync = Assert<Same<z.infer<typeof providerIdSchema>, ProviderId>>;
type _ReasoningInSync = Assert<Same<z.infer<typeof reasoningLevelSchema>, ReasoningLevel>>;
type _CallModeInSync = Assert<Same<z.infer<typeof callModeSchema>, CallMode>>;
type _LanguageInSync = Assert<Same<z.infer<typeof languageSchema>, Language>>;

/**
 * Cấu hình AI **đã lưu ở máy chủ** — `AiConfig` bỏ `persistKey`.
 *
 * `persistKey` là công tắc ở trình duyệt, không phải cột trong `ai_settings`: nó mô tả
 * hành vi của tab này chứ không phải dữ liệu cần chia sẻ (docs/02-DESIGN.md §3.2).
 * Endpoint `POST /api/settings` và `POST /api/sessions` (giai đoạn 0c) chỉ nhận dạng này.
 */
export const storedAiSettingsSchema = z
  .strictObject({
    provider: providerIdSchema,
    /** ID thô, không ép vào danh sách — người dùng tự nhập được (FR-14). */
    model: z.string().trim().min(1).max(200),
    /** Chỉ dùng cho provider "custom"; bắt buộc `https:` vì server sẽ tự gọi URL này. */
    baseUrl: z.url().startsWith("https://").optional(),
    reasoning: reasoningLevelSchema,
    callMode: callModeSchema,
  })
  .superRefine((settings, ctx) => {
    // Endpoint tuỳ chỉnh không có base URL thì không gọi được. Nêu đúng trường thiếu
    // để lỗi 400 chỉ đúng chỗ cần sửa (T-0c.5b).
    if (settings.provider === "custom" && !settings.baseUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "Endpoint tuỳ chỉnh cần base URL HTTPS",
      });
    }
  });

/**
 * Cấu hình AI đi trong body của `start` / `turn` / `evaluate`.
 *
 * Client gửi lại `ai` ở mọi request (docs/02-DESIGN.md §3.4): không có token phiên, và
 * không có hai nguồn sự thật. `persistKey` mặc định `false` vì client nào cũng phải an toàn
 * khi không nhớ gửi.
 *
 * Cố ý **không** có quy tắc "custom không được dùng `direct`" ở đây: UI chặn lựa chọn đó
 * (T-3.3), còn `direct/registry.ts` từ chối provider `custom` — thêm ràng buộc ở server
 * chỉ làm đổi hợp đồng của endpoint giai đoạn 0c mà không thêm lớp bảo vệ nào.
 */
export const aiConfigSchema = storedAiSettingsSchema.safeExtend({
  persistKey: z.boolean().default(false),
});

export type StoredAiSettings = z.infer<typeof storedAiSettingsSchema>;
export type AiConfigInput = z.infer<typeof aiConfigSchema>;

// Bản kiểu của `AiConfig` phải khớp đúng bản parse được — nếu không, một field của
// request có thể bị `.parse()` chấp nhận rồi tới adapter mới vỡ.
type _StoredMatchesAiConfig = Assert<Same<StoredAiSettings, Omit<AiConfig, "persistKey">>>;
type _AiConfigMatchesType = Assert<Same<AiConfigInput, AiConfig>>;

/** Năm lựa chọn khởi tạo phiên (FR-1) — cũng là cấu hình lưu trong `sessions.config_json`. */
export const sessionConfigSchema = z.strictObject({
  role: z.string().trim().min(2).max(120),
  language: languageSchema,
  mode: modeSchema,
  length: lengthSchema,
});

export type SessionConfigInput = z.infer<typeof sessionConfigSchema>;
export type InterviewMode = SessionConfigInput["mode"];
export type InterviewLength = SessionConfigInput["length"];

/**
 * Ba nguồn CV (FR-2). Đây là **union có phân biệt** theo `kind` để lỗi báo đúng nhánh:
 * body thiếu `token` thì không phải lỗi của nhánh `text`.
 *
 * - `none`  — không có CV (FR-4).
 * - `text`  — người dùng dán; trần 20 000 ký tự (FR-3). Không nhận chuỗi rỗng:
 *   thiếu nội dung là lỗi phải báo, không phải ngữ cảnh rỗng đẩy vào im lặng.
 * - `file`  — PDF đã tải lên; `token` là token **đã ký** mà endpoint upload phát ra,
 *   không phải `file_id` thô của hãng (docs/02-DESIGN.md §7.4). `mode` là lựa chọn của
 *   người dùng: provider đọc thẳng hay để server trích text trước.
 */
export const cvSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(20_000),
  }),
  z.strictObject({
    kind: z.literal("file"),
    token: z.string().trim().min(1).max(512),
    mode: z.enum(["direct", "extract"]),
  }),
]);

export type CvSource = z.infer<typeof cvSchema>;

/** `POST /api/interviews/start` — `{ai, config, cv}`. */
export const startRequestSchema = z.strictObject({
  ai: aiConfigSchema,
  config: sessionConfigSchema,
  cv: cvSchema,
});

/**
 * `POST /api/interviews/turn` — `{ai, sessionId, answer}`.
 *
 * Không có `transcript` và không có `turnCount`: server tự nạp lịch sử từ `sessionId`
 * và tự đếm lượt trong DB (FR-20, docs/02-DESIGN.md §8.2). `answer` trần 4 000 ký tự —
 * chặn **trước** khi gọi model (FR-10).
 */
export const turnRequestSchema = z.strictObject({
  ai: aiConfigSchema,
  sessionId: z.uuid(),
  answer: z.string().trim().min(1).max(4_000),
});

/** `POST /api/interviews/evaluate` — `{ai, sessionId, partial}`. */
export const evaluateRequestSchema = z.strictObject({
  ai: aiConfigSchema,
  sessionId: z.uuid(),
  /** Người dùng bấm "kết thúc sớm" → báo cáo không phạt vì chưa trả lời đủ (FR-8). */
  partial: z.boolean().default(false),
});