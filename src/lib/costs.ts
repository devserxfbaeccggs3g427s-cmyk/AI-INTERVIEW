/**
 * Module giá & công thức chi phí AI (FR-SC-15..23).
 *
 * ⚠️ FR-SC-18 — mọi giá trị tiền đều là **ƯỚC TÍNH** theo bảng giá model.
 * UI phải ghi rõ "ước tính" cạnh mọi con số tiền.
 *
 * ⚠️ P7 — không vanity metric: chỉ số liệu cụ thể (token, call, USD).
 */

import { PRICING, estimateCost, type AIModel, type TokenUsage } from "@/lib/anthropic";

export { PRICING, estimateCost };
export type { AIModel, TokenUsage };

/**
 * Bảng giá fallback cho model lạ (FR-SC-18).
 *
 * ⚠️ Dùng bảng giá Opus 5 — **không** ước tính thấp hơn thực tế.
 */
export const FALLBACK_PRICING = {
  input: 5,
  output: 25,
  cacheReadMultiplier: 0.1,
  cacheWriteMultiplier: 1.25,
} as const;

/**
 * Tỉ lệ cache hit (FR-SC-19).
 *
 * Công thức: `cacheRead / (inputTokens + cacheRead + cacheWrite)`.
 * Mẫu số = 0 ⇒ trả 0 (KHÔNG phải `NaN`).
 */
export function cacheHitRate(usage: {
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
}): number {
  const denominator = usage.inputTokens + usage.cacheRead + usage.cacheWrite;
  if (denominator === 0) return 0;

  return Number((usage.cacheRead / denominator).toFixed(4));
}

/**
 * Nhãn + tone cho 10 tính năng AI (FR-SC-16).
 */
export const FEATURE_LABELS: Record<
  string,
  { label: string; tone: "primary" | "secondary" | "tertiary" | "neutral" }
> = {
  daily_plan: { label: "Sinh kế hoạch", tone: "primary" },
  grading: { label: "Chấm điểm", tone: "secondary" },
  journal_feedback: { label: "Phản hồi nhật ký", tone: "primary" },
  weekly_review: { label: "Review tuần", tone: "secondary" },
  classify: { label: "Phân loại", tone: "neutral" },
  roleplay: { label: "Hội thoại", tone: "secondary" },
  mock_interview: { label: "Phỏng vấn", tone: "primary" },
  language_test: { label: "Bài thi", tone: "tertiary" },
  interview: { label: "Phỏng vấn", tone: "primary" },
  speak: { label: "Luyện nói", tone: "secondary" },
};

/**
 * Trích preview nội dung đã gửi lên (FR-SC-27).
 *
 * - Gộp khoảng trắng thành 1.
 * - Cắt giữa câu nếu có dấu câu.
 * - Tối đa `max` ký tự, thêm `…`.
 */
export function buildPreview(text: string, max = 280): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;

  // Cắt giữa câu: tìm dấu câu gần nhất trước `max`.
  const slice = normalized.slice(0, max);
  const lastSentence = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("。"),
  );

  // Ngưỡng 40%: dấu câu đủ gần đầu thì cắt tại đó — preview đọc dễ hơn.
  if (lastSentence >= max * 0.4) {
    return `${slice.slice(0, lastSentence + 1).trim()}…`;
  }

  return `${slice.trimEnd()}…`;
}

/**
 * Che API key (FR-SC-11).
 *
 * Key ngắn (< 8 ký tự) ⇒ trả `••••` (không lộ ký tự nào).
 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 8) return "••••";

  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
}
