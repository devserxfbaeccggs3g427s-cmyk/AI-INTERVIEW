/**
 * Hợp đồng chấm điểm giao tiếp (AI-03 / AI-04) — schema + hàm tính tổng.
 *
 * Vì sao tách khỏi `src/app/api/grade/route.ts`:
 *   - Schema là **hợp đồng dữ liệu** dùng chung cho route handler, test và
 *     (sau này) UI — tách ra để `tests/integration/grading.test.ts` import
 *     trực tiếp mà không kéo theo `next/server` + Prisma (tasks.md 11.8).
 *   - `computeTotal` là **quy tắc nghiệp vụ** (tổng = trung bình 5 tiêu chí)
 *     → phải test được độc lập, không gọi AI.
 *
 * ⚠️ Khoá trong schema phải khớp **chính xác** với `RUBRIC_COMMUNICATION` —
 * trước đây khoá thứ 4 viết là `naturalness` trong khi rubric dùng `natural`
 * → mọi kết quả chấm đều **thiếu** điểm & nhận xét của tiêu chí "Tự nhiên",
 * và `computeTotal` chia cho 5 trong khi chỉ có 4 điểm thực.
 *
 * Xem tasks.md 11.3 / 11.8 · SPEC.md §5.5 · AC-6 · design.md §6.6.
 */

import { z } from "zod";

import { RUBRIC_COMMUNICATION } from "@/lib/rubrics";

/**
 * Khoá tiêu chí **chốt** của rubric giao tiếp.
 *
 * SPEC.md §5.5 + AC-6 cố định đúng 5 tiêu chí, nên ta khai báo union ở đây
 * để TypeScript bắt được sai lệch, đồng thời dùng làm danh sách chuẩn khi
 * tính tổng điểm.
 *
 * ⚠️ Tiêu chí thứ 4 là `natural` — **KHÔNG** phải `naturalness`.
 */
export const GRADING_CRITERION_KEYS = [
  "clarity",
  "structure",
  "tone",
  "natural",
  "grammar",
] as const;

/** Union khoá tiêu chí — dùng để suy ra kiểu `scores` / `comments`. */
export type GradingCriterionKey = (typeof GRADING_CRITERION_KEYS)[number];

/**
 * Chốt an toàn: rubric và schema phải khớp **tuyệt đối**.
 *
 * Nếu ai đó thêm/bớt tiêu chí trong `RUBRIC_COMMUNICATION` mà quên sửa
 * schema → mọi kết quả chấm sẽ lệch. Ở đây ta **fail-fast** ngay lúc import
 * module (server + test) thay vì âm thầm chấm sai.
 */
const actualCriterionKeys = RUBRIC_COMMUNICATION.map((c) => c.key);
const missingKeys = GRADING_CRITERION_KEYS.filter(
  (key) => !actualCriterionKeys.includes(key),
);
const extraKeys = actualCriterionKeys.filter(
  (key) => !(GRADING_CRITERION_KEYS as readonly string[]).includes(key),
);

if (missingKeys.length > 0 || extraKeys.length > 0) {
  throw new Error(
    `[grading-schema] Rubric không khớp schema chấm điểm — ` +
      `thiếu: [${missingKeys.join(", ")}], thừa: [${extraKeys.join(", ")}]. ` +
      `SPEC.md §5.5 chốt đúng 5 tiêu chí: ${GRADING_CRITERION_KEYS.join(", ")}.`,
  );
}

/** Shape của 5 khoá tiêu chí, mỗi khoá cùng một kiểu zod. */
type CriterionShape<T> = { [K in GradingCriterionKey]: T };

/** Shape điểm — số nguyên 0–5 (không nhận số thập phân ngoài 0–5). */
const scoreShape = Object.fromEntries(
  RUBRIC_COMMUNICATION.map((c) => [c.key, z.number().int().min(0).max(5)]),
) as CriterionShape<z.ZodNumber>;

/** Shape nhận xét — 1 chuỗi mỗi tiêu chí. */
const commentShape = Object.fromEntries(
  RUBRIC_COMMUNICATION.map((c) => [c.key, z.string()]),
) as CriterionShape<z.ZodString>;

/**
 * Schema structured output cho rubric 5 tiêu chí.
 *
 * Dùng `strictObject` ở **mọi** cấp: schema là hợp đồng "đúng 5 tiêu chí,
 * không tiêu chí ngoài rubric" (AC-6) → payload có thừa khoá phải **bị từ chối**
 * chứ không âm thầm bị cắt bỏ. (JSON Schema gửi lên API cũng đã là
 * `additionalProperties: false` — xem `transformJSONSchema` của SDK.)
 */
export const GradingSchema = z.strictObject({
  scores: z.strictObject(scoreShape),
  comments: z.strictObject(commentShape),
  suggestions: z.array(z.string()).max(3),
});

/** Kiểu dữ liệu mà schema sinh ra — dùng cho `callAi<GradingOutput>(...)`. */
export type GradingOutput = z.infer<typeof GradingSchema>;

/**
 * Tính tổng điểm = **trung bình 5 tiêu chí** (AC-6).
 *
 * - Chỉ tính trên đúng 5 khoá rubric — khoá ngoài rubric **không** được tính
 *   vào trung bình (kể cả khi lọt qua schema).
 * - Tiêu chí thiếu điểm được coi là 0 (khớp `RubricGrid` vốn dùng `?? 0`).
 * - Làm tròn 1 chữ số thập phân để hiển thị ổn định.
 */
export function computeTotal(scores: Record<string, number>): number {
  const values = GRADING_CRITERION_KEYS.map((key) => scores[key] ?? 0);
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Gom kết quả chấm điểm đầy đủ (scores + comments + suggestions + total).
 *
 * `total` **luôn** được tính ở backend từ 5 tiêu chí — không tin giá trị
 * `total` do AI trả về (AI được dặn không trả `total`; xem `buildUserPrompt`).
 */
export function buildGradingResult(output: GradingOutput): {
  scores: GradingOutput["scores"];
  comments: GradingOutput["comments"];
  suggestions: string[];
  total: number;
} {
  return {
    scores: output.scores,
    comments: output.comments,
    suggestions: output.suggestions,
    total: computeTotal(output.scores),
  };
}

/**
 * Dựng user prompt cho lượt chấm điểm.
 *
 * ⚠️ Phần mô tả tiêu chí **phải** suy ra từ `RUBRIC_COMMUNICATION` — nếu
 * hardcode danh sách riêng, prompt và schema sẽ lệch nhau.
 */
export function buildUserPrompt(
  mode: "write" | "talk",
  prompt: string,
  content: string,
  language: string,
): string {
  const criteria = RUBRIC_COMMUNICATION.map((c) => `- ${c.key}: ${c.desc}`).join("\n");
  const langLabel =
    { vi: "Tiếng Việt", en: "Tiếng Anh", zh: "Tiếng Trung" }[language] ?? "Tiếng Việt";

  return [
    `Chế độ: ${mode === "write" ? "Viết" : "Nói"} (${langLabel})`,
    `Đề bài / ngữ cảnh: ${prompt}`,
    `Nội dung người dùng:`,
    `"""`,
    content,
    `"""`,
    "",
    `Hãy chấm theo ${RUBRIC_COMMUNICATION.length} tiêu chí sau (mỗi tiêu chí 0–5):`,
    criteria,
    "",
    "Yêu cầu:",
    `1. Trả về đúng schema JSON: scores (object ${RUBRIC_COMMUNICATION.length} tiêu chí 0–5), comments (object ${RUBRIC_COMMUNICATION.length} tiêu chí), suggestions (mảng tối đa 3 chuỗi).`,
    "2. `total` sẽ được tính ở backend = trung bình các tiêu chí.",
    "3. Nhận xét ngắn gọn, cụ thể, dùng được ngay.",
    "4. `suggestions` là các đề xuất sửa đổi cụ thể (tối đa 3).",
    "5. Không thêm trường nào ngoài schema.",
  ].join("\n");
}
