import { env } from "@/lib/env";
import { listSpeakPrompts } from "@/lib/speak";

import { PracticeWriter } from "@/components/speak/practice-writer";

export const dynamic = "force-dynamic";

/**
 * S07 — Luyện giao tiếp (Viết) (`/speak/write`).
 *
 * ⚠️ Spec §1: S07/S08 dùng rubric 5 tiêu chí **giao tiếp**
 * (Rõ ràng · Cấu trúc · Giọng văn · Tự nhiên · Ngữ pháp).
 *
 * ⚠️ AC-CM-11 — không có API key ⇒ nói rõ là chấm rule cục bộ, không giả lập AI.
 */
export default async function SpeakWritePage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;

  // ⚠️ S07 = chế độ "write" — chỉ lấy bài viết.
  const prompts = (await listSpeakPrompts()).filter(
    (prompt) => prompt.mode === "write" || prompt.mode === "both",
  );

  return (
    <PracticeWriter
      prompts={prompts}
      aiEnabled={!env.isOffline}
      initialPromptId={params.prompt ?? undefined}
    />
  );
}
