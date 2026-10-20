import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { getProviderSpec } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = modelConfigInput;

export async function POST(req: Request) {
  const parsed = parseModelConfig(await req.json().catch(() => null), req.headers.get("x-api-key") ?? undefined, Body, { allowMissingKey: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { body, cfg, keyError } = parsed;
  const fallback = getProviderSpec(body.provider).models;

  if (keyError) {
    return NextResponse.json({ ok: false, models: fallback, warning: keyError });
  }

  const provider = getProvider(body.provider);

  let models: { id: string; label?: string }[] = [];
  let warning: string | undefined;
  try {
    models = await provider.listModels({ sessionId: "list", trace: "list-models" }, cfg);
  } catch (error) {
    warning = body.provider === "custom" ? (error as Error).message.slice(0, 200) : undefined;
  }

  // Fallback to local catalogue if remote returned nothing.
  if (!models.length) {
    models = [...fallback];
    if (body.provider === "custom") warning ??= "Không lấy được model từ endpoint; nhập Model ID thủ công.";
  }

  return NextResponse.json({ ok: !warning, models, ...(warning ? { warning } : {}) });
}
