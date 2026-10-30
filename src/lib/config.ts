/**
 * Hằng số cấu hình toàn app.
 * Nguồn: `.kiro/steering/project.md` §5 + `.kiro/steering/data-model-registry.md`.
 */

/** Số slot kế hoạch trong 1 ngày (S01). */
export const SLOT_COUNT = 6;

/** Level kỹ năng tối đa (thang 0–5). */
export const SKILL_LEVEL_MAX = 5;

/** Số Evidence (rating >= 3) cần để tăng 1 level kỹ năng — quy tắc B4. */
export const EVIDENCE_THRESHOLD = 3;

/** Rating tối thiểu để Evidence được tính vào level. */
export const EVIDENCE_RATING_MIN = 3;

/** Mục tiêu ghi nhật trong 10 giây (P2). */
export const QUICK_LOG_MAX_SECONDS = 10;

/** Thời lượng tối đa cho 1 lượt ghi chỉ số cá nhân (giây). */
export const DAILY_STATE_MAX_SECONDS = 15;

/** Số thẻ tối đa trong 1 phiên ôn SRS. */
export const SRS_SESSION_MAX_CARDS = 20;

/** Số câu có thể chọn cho 1 phiên mock interview. */
export const INTERVIEW_QUESTION_COUNTS = [5, 8, 12] as const;

/** Số câu theo từng loại bài kiểm tra ngoại ngữ. */
export const TEST_COUNTS = {
  placement: 25,
  topic: 20,
  benchmark: 40,
  from_content: 10,
} as const;

/** Nguồn kế hoạch khi AI không dùng được (offline) — quy tắc B5. */
export const PLAN_FALLBACK_SOURCE = "fallback" as const;

/** Ngày trong tuần chạy weekly review. */
export const WEEKLY_REVIEW_DAY = "sunday" as const;

/** Ngưỡng "ma sát đang chờ" (tertiary) — số ngày tồn đọng. */
export const FRICTION_DAYS = 3;

/** Độ dài tối đa cho tiêu đề hoạt động. */
export const ACTIVITY_TITLE_MAX = 120;

/** Số ký tự tối đa cho `AiCall.dataPreview` khi hiển thị ở panel minh bạch. */
export const DATA_PREVIEW_MAX = 280;
