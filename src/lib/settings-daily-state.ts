/**
 * Server action lưu trạng thái sinh trắc (S12 · task 8.2).
 *
 * ⚠️ Vì sao file này tồn tại?
 *   Next.js **không cho phép** file `page.tsx` export thêm ngoài `default`
 *   (và các field đặc biệt như `generateMetadata`). Server action `saveDailyState`
 *   phải nằm ngoài page → tách ra module riêng rồi import vào page.
 *
 * ⚠️ NFR-08 (P6 STRICT_LOCAL):
 *   Dữ liệu sinh trắc (mood/energy/focus/sleep) **KHÔNG BAO GIỜ** rời máy.
 *   Action này chỉ ghi vào SQLite cục bộ — không gọi AI, không gọi network.
 *
 * Xem tasks.md 8.2 · design.md §4.12 · requirements.md FR-PS-01 / NFR-08.
 */

import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import { revalidatePath } from "next/cache";
// Kiểu dùng chung nằm ở module type-only → không kéo client component vào bundle server.
import type { SaveState } from "@/lib/settings-types";

export type { SaveState };

/** Chuyển 1 giá trị bất kỳ về số nguyên 1–5, hoặc `null` nếu không hợp lệ. */
function clampInt(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/** Parse `YYYY-MM-DD` thành Date chuẩn hoá 00:00 giờ local. */
function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return startOfDay(date);
}

/**
 * Server action: lưu trạng thái sinh trắc của 1 ngày.
 *
 * `date` là khoá duy nhất (`DailyState.date` unique) → `upsert` thay vì `create`
 * để không bao giờ sinh 2 bản ghi cho cùng một ngày (task 8.2).
 */
export async function saveDailyState(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  "use server";
  const dateRaw = String(formData.get("date") ?? "");
  const moodRaw = Number(formData.get("mood"));
  const energyRaw = Number(formData.get("energy"));
  const focusRaw = Number(formData.get("focus"));
  const sleepRaw = Number(formData.get("sleep"));
  const noteRaw = String(formData.get("note") ?? "").trim();

  // Chỉ nhận các giá trị hợp lệ — chặn dữ liệu rác từ client.
  const mood = clampInt(moodRaw);
  const energy = clampInt(energyRaw);
  const focus = clampInt(focusRaw);
  const sleep = Number.isFinite(sleepRaw) ? Math.max(0, Math.min(24, sleepRaw)) : null;

  if (mood === null || energy === null || focus === null) {
    return { ok: false, message: "Chỉ số không hợp lệ (cần giá trị 1–5)." };
  }

  // Ngày phải là `YYYY-MM-DD` — không nhận date tuỳ ý từ client.
  const date = parseDateKey(dateRaw);
  if (date === null) {
    return { ok: false, message: "Ngày không hợp lệ." };
  }

  try {
    await prisma.dailyState.upsert({
      where: { date },
      create: {
        date,
        mood,
        energy,
        focus,
        sleep,
        note: noteRaw.length > 0 ? noteRaw.slice(0, 500) : null,
      },
      update: {
        mood,
        energy,
        focus,
        sleep,
        note: noteRaw.length > 0 ? noteRaw.slice(0, 500) : null,
      },
    });
  } catch {
    return { ok: false, message: "Không ghi được, thử lại." };
  }

  // Render lại trang để chấm 7 ngày + biểu đồ cập nhật.
  revalidatePath("/state");

  return {
    ok: true,
    message: "Đã lưu trạng thái hôm nay thành công! Ghi vào SQLite cục bộ.",
  };
}
