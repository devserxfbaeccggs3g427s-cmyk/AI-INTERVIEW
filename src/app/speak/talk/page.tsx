import { env } from "@/lib/env";
import { listSpeakPrompts } from "@/lib/speak";

import { SpeakTalk } from "@/components/speak/speak-talk";

export const dynamic = "force-dynamic";

/**
 * S08 — Luyện giao tiếp (Nói) (`/speak/talk`).
 *
 * ⚠️ AC-CM-4 — chấm nói dùng MediaRecorder + STT (Web Speech API).
 * ⚠️ AC-CM-11 — không có API key ⇒ nói rõ, không giả lập.
 */
export default async function SpeakTalkPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;

  // ⚠️ S08 = chế độ "speak" — bài nói trình bày, không phải bài viết.
  const prompts = (await listSpeakPrompts()).filter(
    (prompt) => prompt.mode === "speak" || prompt.mode === "both",
  );

  return (
    <SpeakTalk
      prompts={prompts}
      aiEnabled={!env.isOffline}
      initialPromptId={params.prompt ?? undefined}
    />
  );
}
