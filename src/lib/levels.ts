/**
 * Tính level kỹ năng — CHỈ dựa trên `Evidence` (pure functions, no DB).
 *
 * FR-SK-03 / FR-SK-04 (SPEC.md §2.2) + AC-3:
 *   - level KHÔNG BAO GIỜ tăng do tick checkbox hay do AI.
 *   - level N cần tối thiểu `LEVEL_THRESHOLDS[N]` evidence có `rating >= 3`.
 *
 * Xem tasks.md 4.6 · design.md §5.1.
 */

/**
 * Ngưỡng số bằng chứng (rating >= 3) cho từng level.
 * Index = level. level 0 cần 0 bằng chứng, level 1 cần 2, … level 5 cần 20.
 */
export const LEVEL_THRESHOLDS = [0, 2, 5, 9, 14, 20] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

/** Số bằng chứng cần thêm để lên level kế tiếp. */
export function evidenceToNextLevel(currentLevel: number, evidenceCount: number): number {
  if (currentLevel >= MAX_LEVEL) return 0;
  const next = currentLevel + 1;
  const need = LEVEL_THRESHOLDS[next] ?? LEVEL_THRESHOLDS[MAX_LEVEL] ?? 0;
  return Math.max(0, need - evidenceCount);
}

/** Level tối đa đạt được với `count` bằng chứng chất lượng (rating >= 3). */
export function levelForEvidenceCount(count: number): number {
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    const threshold = LEVEL_THRESHOLDS[i];
    if (threshold !== undefined && count >= threshold) {
      level = i;
    }
  }
  return level;
}

/**
 * % tiến trình tới level kế tiếp — dùng cho thanh tiến trình ở S01/S03.
 * Trả về 0..100.
 */
export function progressToNextLevel(currentLevel: number, evidenceCount: number): number {
  if (currentLevel >= MAX_LEVEL) return 100;
  const currentNeed = LEVEL_THRESHOLDS[currentLevel] ?? 0;
  const nextNeed = LEVEL_THRESHOLDS[currentLevel + 1] ?? currentNeed;
  if (nextNeed <= currentNeed) return 100;
  const span = nextNeed - currentNeed;
  if (span <= 0) return 100;
  const have = Math.max(0, evidenceCount - currentNeed);
  return Math.min(100, Math.round((have / span) * 100));
}