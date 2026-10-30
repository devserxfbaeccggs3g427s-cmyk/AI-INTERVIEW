/**
 * Server action lưu hồ sơ người dùng (S15 · task 9.2).
 *
 * ⚠️ Vì sao file này tồn tại?
 *   Next.js **không cho phép** file `page.tsx` export thêm ngoài `default`.
 *   Server action `saveProfile` phải nằm ngoài page → tách ra module riêng.
 *
 * ⚠️ P6 STRICT_LOCAL:
 *   Hồ sơ (tên, mục tiêu, giọng AI) chỉ nằm trong SQLite cục bộ.
 *
 * Xem tasks.md 9.2 · design.md §4.15 · requirements.md FR-PS-07.
 */

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
// Kiểu dùng chung nằm ở module type-only → không kéo client component vào bundle server.
import type { ProfileSaveState } from "@/lib/settings-types";

export type { ProfileSaveState };

/**
 * Server action: lưu hồ sơ vào `UserProfile`.
 *
 * `UserProfile` chỉ có **1 bản ghi duy nhất** cho toàn hệ thống → dùng `upsert`
 * với `id` cố định (`primary`) để không sinh bản ghi trùng.
 */
export async function saveProfile(
  _prev: ProfileSaveState,
  formData: FormData,
): Promise<ProfileSaveState> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const goals = String(formData.get("goals") ?? "").trim();
  const aiTone = String(formData.get("aiTone") ?? "direct");
  const learningLangs = String(formData.get("learningLangs") ?? "");
  const zhLevel = String(formData.get("zhLevel") ?? "zero");
  const enLevel = String(formData.get("enLevel") ?? "zero");

  if (learningLangs.length === 0) {
    return { ok: false, message: "Hãy chọn ít nhất 1 ngôn ngữ đang học." };
  }
  if (!["direct", "coach", "gentle"].includes(aiTone)) {
    return { ok: false, message: "Giọng AI không hợp lệ." };
  }

  try {
    await prisma.userProfile.upsert({
      where: { id: "primary" },
      create: {
        id: "primary",
        name: name.length > 0 ? name.slice(0, 120) : null,
        goals: goals.length > 0 ? goals.slice(0, 2000) : null,
        aiTone,
        learningLangs,
        zhLevel,
        enLevel,
      },
      update: {
        name: name.length > 0 ? name.slice(0, 120) : null,
        goals: goals.length > 0 ? goals.slice(0, 2000) : null,
        aiTone,
        learningLangs,
        zhLevel,
        enLevel,
      },
    });
  } catch {
    return { ok: false, message: "Không lưu được hồ sơ, thử lại." };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Đã lưu hồ sơ." };
}
