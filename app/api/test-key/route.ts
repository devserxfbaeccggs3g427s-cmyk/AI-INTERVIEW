import { getProvider } from "@/lib/providers";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { env } from "@/lib/env";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const parsed = parseModelConfig(await req.json().catch(() => null), req.headers.get("x-api-key") ?? undefined, modelConfigInput);
  if (!parsed.ok) return privateJson({ ok: false, detail: parsed.error }, { status: 400 });

  const provider = getProvider(parsed.cfg.provider);
  const test = await provider.testKey({ sessionId: "test", trace: "test-key" }, parsed.cfg);
  return privateJson(test, { status: test.ok ? 200 : 400 });
}
