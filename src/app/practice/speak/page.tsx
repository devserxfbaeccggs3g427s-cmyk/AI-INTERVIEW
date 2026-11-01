import { env } from "@/lib/env";
import { listSpeakPrompts } from "@/lib/speak";

import { PracticeWriter } from "@/components/speak/practice-writer";

export const dynamic = "force-dynamic";

/**
 * S10 — Luyện nói & viết (`/practice/speak`).
 *
 * ⚠️ AC-CM-11 — không có API key ⇒ nói rõ là chấm rule cục bộ, không giả lập AI.
 */
export default async function PracticeSpeakPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const prompts = await listSpeakPrompts();

  return (
    <PracticeWriter
      prompts={prompts}
      aiEnabled={!env.isOffline}
      initialPromptId={params.prompt ?? undefined}
    />
  );
}
