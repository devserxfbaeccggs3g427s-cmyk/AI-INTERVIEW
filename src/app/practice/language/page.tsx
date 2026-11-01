import { env } from "@/lib/env";
import { listRoleplayScenarios, listSpeakPrompts } from "@/lib/speak";

import { LanguagePractice } from "@/components/speak/language-practice";

export const dynamic = "force-dynamic";

/**
 * S11 — Luyện ngoại ngữ (`/practice/language`): bài viết + hội thoại role-play.
 *
 * ⚠️ AC-CM-6 — kho bài mẫu + bài tự tạo.
 * ⚠️ AC-CM-7 — hội thoại có mục tiêu ẩn, chỉ lộ khi chấm.
 */
export default async function LanguagePracticePage() {
  const [prompts, scenarios] = await Promise.all([
    listSpeakPrompts(),
    listRoleplayScenarios(),
  ]);

  return (
    <LanguagePractice
      prompts={prompts}
      scenarios={scenarios}
      aiEnabled={!env.isOffline}
    />
  );
}
