import { NextResponse } from "next/server";
import { z } from "zod";
import { withCredentials, getProvider } from "@/lib/providers";
import { PROVIDER_MODELS } from "@/lib/types";
import type { ModelConfig } from "@/lib/types";
import { requireApiKey, validateCustomBaseUrl } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
  model: z.string().min(1).max(200),
  baseUrl: z.string().max(500).optional(),
  apiKey: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  if (body.provider === "custom") {
    const err = validateCustomBaseUrl(body.baseUrl ?? "");
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const keyErr = requireApiKey(body.provider, body.apiKey);
  // custom may not need a key — that's fine; listModels handles it.

  const cfg: ModelConfig = {
    provider: body.provider,
    model: body.model,
    base_url: body.baseUrl ?? null,
    temperature: 0.4,
    max_tokens: 4096,
    top_p: 0.95,
  };
  const provider = getProvider(body.provider);

  let models: { id: string; label?: string }[] = [];
  try {
    models = await provider.listModels({ sessionId: "list", trace: "list-models" }, withCredentials(cfg, body.apiKey, body.baseUrl));
  } catch {
    models = [];
  }

  // Fallback to local catalogue if remote returned nothing.
  if (!models.length) models = PROVIDER_MODELS[body.provider];

  if (keyErr && body.provider !== "custom") {
    // Surface the catalogue so UI still lets the user pick; the test-key call later will catch it.
    return NextResponse.json({ ok: false, models, warning: keyErr }, { status: 200 });
  }

  return NextResponse.json({ ok: true, models });
}
