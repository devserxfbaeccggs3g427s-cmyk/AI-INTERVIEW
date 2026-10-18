import { NextResponse } from "next/server";
import { z } from "zod";
import { withCredentials, getProvider } from "@/lib/providers";
import type { ModelConfig } from "@/lib/types";
import { requireApiKey, validateCustomBaseUrl } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
  model: z.string().min(1).max(200),
  baseUrl: z.string().max(500).optional(),
  apiKey: z.string().max(500).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(64).max(32000).optional(),
  topP: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, detail: (e as Error).message }, { status: 400 });
  }

  const cfg: ModelConfig = {
    provider: body.provider,
    model: body.model,
    base_url: body.baseUrl ?? null,
    temperature: body.temperature ?? 0.4,
    max_tokens: body.maxTokens ?? 4096,
    top_p: body.topP ?? 0.95,
  };

  const keyErr = requireApiKey(cfg.provider, body.apiKey);
  if (keyErr) return NextResponse.json({ ok: false, detail: keyErr }, { status: 400 });

  if (cfg.provider === "custom") {
    const err = validateCustomBaseUrl(body.baseUrl ?? "");
    if (err) return NextResponse.json({ ok: false, detail: err }, { status: 400 });
  }

  const provider = getProvider(cfg.provider);
  const test = await provider.testKey({ sessionId: "test", trace: "test-key" }, withCredentials(cfg, body.apiKey, body.baseUrl));
  return NextResponse.json(test, { status: test.ok ? 200 : 400 });
}
