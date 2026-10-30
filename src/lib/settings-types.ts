/**
 * Kiểu dữ liệu dùng chung cho nhóm 8 + nhóm 9 (S12 · S15).
 *
 * ⚠️ Vì sao file này tồn tại?
 *   Server action (`src/lib/settings-daily-state.ts`, `src/lib/settings-profile.ts`)
 *   và component client (`StateDots.tsx`, `ProfileTab.tsx`) đều cần dùng chung
 *   các type này. Đặt type ở module riêng giúp:
 *   - component client KHÔNG phải import trực tiếp từ module chứa server
 *     action (tránh kéo server action vào bundle client),
 *   - server action KHÔNG phải import type từ file `"use client"`.
 *
 * File này chỉ chứa type → không có runtime code, không ảnh hưởng bundle.
 *
 * Xem tasks.md 8.1 / 8.2 / 9.2.
 */

/** Trạng thái trả về từ server action `saveDailyState` (S12). */
export type SaveState = {
  ok: boolean;
  message: string;
  /** Thời gian thao tác thực tế (ms) — AC 10.3. */
  elapsedMs?: number;
};

/** Trạng thái trả về từ server action `saveProfile` (S15). */
export type ProfileSaveState = {
  ok: boolean;
  message: string;
};

/** Dữ liệu hồ sơ hiện tại — server đọc từ `UserProfile`. */
export type ProfileValues = {
  name: string;
  goals: string;
  aiTone: string;
  learningLangs: string;
  zhLevel: string;
  enLevel: string;
};
