import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = parseModelConfig(await req.json().catch(() => null), req.headers.get("x-api-key") ?? undefined, modelConfigInput);
  if (!parsed.ok) return NextResponse.json({ ok: false, detail: parsed.error }, { status: 400 });

  const provider = getProvider(parsed.cfg.provider);
  const test = await provider.testKey({ sessionId: "test", trace: "test-key" }, parsed.cfg);
  return NextResponse.json(test, { status: test.ok ? 200 : 400 });
}
