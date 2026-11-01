import { ok, toResponse } from "@/lib/api-response";
import { listRoleplayScenarios, listSpeakPrompts } from "@/lib/speak";

export const dynamic = "force-dynamic";

/**
 * GET /api/speak/prompts — kho bài luyện nói + tình huống hội thoại (AC-CM-6).
 *
 * ⚠️ Đọc từ seed (`Activity` type = speak/roleplay) — không hardcode.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const mode = url.searchParams.get("mode");

  const [prompts, scenarios] = await Promise.all([
    listSpeakPrompts({
      ...(lang ? { lang } : {}),
      ...(mode ? { mode } : {}),
    }),
    listRoleplayScenarios(),
  ]);

  return toResponse(ok({ prompts, scenarios }));
}
