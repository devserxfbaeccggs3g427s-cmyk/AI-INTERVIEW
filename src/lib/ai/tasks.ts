/**
 * Danh mục task của AI Router — **client-safe** (không import Prisma, không
 * `server-only`).
 *
 * ⚠️ Vì sao file này tồn tại?
 *   `router.ts` import `@/lib/db` → là module server-only. Nếu component
 *   client (panel chọn model local ở S15) import trực tiếp từ `router.ts` thì
 *   bundle client sẽ kéo theo Prisma → lỗi build.
 *
 *   Vì vậy: danh sách task + nhãn tiếng Việt nằm ở đây (module thuần), còn
 *   `router.ts` import **type** từ đây. Nguồn sự thật của *provider/model*
 *   vẫn là bảng `ROUTES` trong `router.ts` (design.md §6.1).
 *
 * Test `tests/unit/tasks.test.ts` chốt việc 2 danh mục này **không lệch** với
 * `ROUTES` (18 task, 7 task local).
 *
 * Xem tasks.md 17.10 · design.md §6.1 / §6.9.
 */

/** 18 task mà router điều phối (design.md §6.1). */
export const AI_TASK_IDS = [
  // ── local (7) ────────────────────────────────────────────────────────────
  "autofill",
  "classify",
  "language_correct",
  "language_level",
  "test_from_content",
  "biometric_correlate",
  "mock_next_question",
  // ── anthropic (10) ───────────────────────────────────────────────────────
  "daily_plan",
  "grading",
  "journal_feedback",
  "weekly_review",
  "roleplay",
  "language_cards",
  "mock_interview",
  "mock_interview_turn",
  "mock_interview_report",
  "language_test_grade",
  // ── không gọi AI (1) ─────────────────────────────────────────────────────
  "test_blueprint",
] as const;

/** Id của 1 task trong AI Router. */
export type AiTask = (typeof AI_TASK_IDS)[number];

/**
 * 7 task chạy provider local — liệt kê tường minh để component client dùng
 * được. Test chốt danh sách này khớp `LOCAL_TASKS` suy ra từ `ROUTES`.
 */
export const LOCAL_TASK_IDS = [
  "autofill",
  "classify",
  "language_correct",
  "language_level",
  "test_from_content",
  "biometric_correlate",
  "mock_next_question",
] as const;

/** Id của 1 task chạy provider local. */
export type LocalTaskId = (typeof LOCAL_TASK_IDS)[number];

/** Nhãn tiếng Việt của từng task — dùng cho dropdown + bảng chi phí. */
export const TASK_LABELS: Record<AiTask, string> = {
  autofill: "Ghi nhanh tự động",
  classify: "Phân loại nội dung",
  language_correct: "Sửa lỗi ngôn ngữ",
  language_level: "Ước lượng trình độ",
  test_from_content: "Sinh đề từ nội dung",
  biometric_correlate: "Đối chiếu sinh trắc",
  mock_next_question: "Câu hỏi phỏng vấn kế tiếp",
  daily_plan: "Sinh kế hoạch ngày",
  grading: "Chấm bài (giao tiếp)",
  journal_feedback: "Phản hồi nhật ký",
  weekly_review: "Tổng kết tuần",
  roleplay: "Luyện roleplay",
  language_cards: "Sinh thẻ ngôn ngữ",
  mock_interview: "Phỏng vấn (phiên)",
  mock_interview_turn: "Phỏng vấn (lượt)",
  mock_interview_report: "Phỏng vấn (báo cáo)",
  language_test_grade: "Chấm bài kiểm tra",
  test_blueprint: "Chọn lọc đề (không gọi AI)",
};

/** Nhãn của 1 task local (dùng cho dropdown chọn model ở S15). */
export const LOCAL_TASK_LABELS: Record<LocalTaskId, string> = {
  autofill: TASK_LABELS.autofill,
  classify: TASK_LABELS.classify,
  language_correct: TASK_LABELS.language_correct,
  language_level: TASK_LABELS.language_level,
  test_from_content: TASK_LABELS.test_from_content,
  biometric_correlate: TASK_LABELS.biometric_correlate,
  mock_next_question: TASK_LABELS.mock_next_question,
};

/** Task id có hợp lệ không (dùng để validate request server-side). */
export function isAiTask(value: unknown): value is AiTask {
  return typeof value === "string" && (AI_TASK_IDS as readonly string[]).includes(value);
}
