/**
 * DTO dùng chung cho S01 — Daily Loop (`/`).
 *
 * Tách riêng khỏi `src/lib/types.ts` (file của agent nền tảng) để không đụng
 * vào file của agent khác. Tất cả kiểu ở đây là **plain JSON** nên có thể
 * truyền từ Server Component (`src/app/page.tsx`) sang Client Component
 * (`src/components/daily-loop/*`) mà không cần serializer.
 *
 * Xem tasks.md 4.1–4.11 · design.md §4.1.
 */

import type { Domain } from "@/lib/types";

/** 1 slot kế hoạch đã đọc từ `PlanItem` + tên skill để hiển thị. */
export type DailySlotDTO = {
  /** Id `PlanItem` — gửi lên `POST /api/log` với `source: "plan_item"`. */
  planItemId: string | null;
  /** 0..5 — thứ tự thời gian trong ngày. */
  slot: number;
  domain: Domain;
  action: string;
  detail: string | null;
  minutes: number;
  skillId: string | null;
  skillName: string | null;
  done: boolean;
  /** Slot ưu tiên (slot 0, hoặc slot đầu tiên chưa xong) → có rail màu. */
  isPriority: boolean;
};

/** Dữ liệu cho `FocusNodeCard` (task 4.2). */
export type FocusDTO = {
  skillId: string | null;
  name: string;
  level: number;
  targetLevel: number;
  /** Số bằng chứng có `rating >= 3` — chỉ số này mới làm tăng level. */
  evidenceCount: number;
  accumulatedMinutes: number;
  /** true = người dùng tự đặt, false = hệ thống tự suy ra skill yếu nhất. */
  isManual: boolean;
  /** Nhãn provider AI thật (FR-AI-11). */
  aiChip: string;
  aiIsLocal: boolean;
};

/** 1 cột trong `WeekStreak` (task 4.3). */
export type WeekDayDTO = {
  /** `YYYY-MM-DD` giờ local — dùng làm `key` và tra cứu. */
  dateKey: string;
  /** Nhãn thứ: T2 · T3 · … · CN. */
  label: string;
  /** Ngày trong tháng. */
  day: number;
  state: "done" | "missed" | "today" | "future";
  doneCount: number;
  totalCount: number;
};

/** Thống kê FSRS cho `FsrsRetrievabilityCard` (task 4.7). */
export type FsrsStatsDTO = {
  /** Retention trung bình (%) của các thẻ đã học. `null` = chưa có thẻ nào học. */
  retention: number | null;
  avgStability: number | null;
  avgDifficulty: number | null;
  /** Đường cong suy giảm 7 ngày — mỗi điểm 0..1. */
  curve: number[];
  /** Số thẻ đã qua ít nhất 1 lần ôn (state ≠ New). */
  learningCount: number;
  totalCount: number;
};

/** Thống kê prompt cache cho `CacheHitCard` (task 4.8). */
export type CacheStatsDTO = {
  /** `sum(cacheRead) / sum(inputTokens + cacheRead)` — 0 khi mẫu số = 0. */
  hitRate: number;
  cacheReadTokens: number;
  inputTokens: number;
  totalCalls: number;
};

/** Dữ liệu cho `BioRhythmPanel` (task 4.9). */
export type BioRhythmDTO = {
  /** mood / energy / focus: 1..5. `null` = hôm nay chưa đánh giá. */
  mood: number | null;
  energy: number | null;
  focus: number | null;
  /** Giấc ngủ (giờ). */
  sleep: number | null;
  /** Số thẻ SRS đến hạn hôm nay (`Card.due <= now`). */
  dueCards: number;
  /** Năng lượng tuần 0–100. */
  weekEnergy: number;
  /** Chuỗi ngày liên tiếp có hoàn thành. */
  streak: number;
};
