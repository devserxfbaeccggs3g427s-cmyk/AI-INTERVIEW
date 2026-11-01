/**
 * State machine của phiên + xác định câu đang dở để resume (FR-MI-13).
 *
 * ⚠️ Quy tắc bất di bất dịch: `askedCount` tăng **ngay khi sinh câu hỏi**
 * (không phải khi trả lời) ⇒ "câu đang dở" luôn xác định được mà không cần cột
 * riêng.
 *
 * Nguồn: `.kiro/specs/mock-interview/design.md` §3.9.
 */

import type { SessionStatus } from "@/lib/interview";

export type { SessionStatus };

export interface SessionSnapshot {
  readonly id: string;
  readonly status: SessionStatus;
  readonly plannedCount: number;
  readonly askedCount: number;
  readonly turns: ReadonlyArray<{
    readonly id: string;
    readonly index: number;
    readonly answer: string | null;
    readonly total: number | null;
  }>;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/**
 * Câu đang dở = turn chưa có `answer`.
 *
 * Trả `null` khi phiên đã hết câu.
 */
export function currentTurnIndex(session: SessionSnapshot): number | null {
  const pending = session.turns.find((turn) => turn.answer === null);
  return pending ? pending.index : null;
}

/**
 * Câu cuối cùng đã trả lời — dùng cho panel "Đánh giá Câu N-1".
 */
export function lastAnsweredTurnIndex(session: SessionSnapshot): number | null {
  let last: number | null = null;

  for (const turn of session.turns) {
    if (turn.answer !== null) last = turn.index;
  }

  return last;
}

/**
 * Các chuyển trạng thái hợp lệ:
 * ```
 * active   → paused | done | abandoned
 * paused   → active | abandoned
 * done     → (không) — đã kết thúc, không hồi sinh
 * abandoned→ (không) — đã bỏ, không hồi sinh
 * ```
 */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return true;

  switch (from) {
    case "active":
      return to === "paused" || to === "done" || to === "abandoned";
    case "paused":
      return to === "active" || to === "abandoned";
    case "done":
    case "abandoned":
      return false;
    default:
      return false;
  }
}

/**
 * Trạng thái phiên mới sau khi gửi 1 lượt.
 * `askedCount >= plannedCount` ⇒ `'done'`, ngược lại `'active'`.
 */
export function statusAfterTurn(askedCount: number, plannedCount: number): SessionStatus {
  return askedCount >= plannedCount ? "done" : "active";
}

/** Số phút làm tròn thành bội số 5, tối thiểu 5. */
export function roundMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 5;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/**
 * Thời lượng thực tế của phiên (phút, bội số 5, tối thiểu 5).
 *
 * @param now mốc hiện tại (mặc định `new Date()`).
 */
export function computeSessionMinutes(session: SessionSnapshot, now: Date = new Date()): number {
  const end = session.endedAt ?? now;
  const ms = end.getTime() - session.startedAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 5;

  return roundMinutes(ms / 60_000);
}
