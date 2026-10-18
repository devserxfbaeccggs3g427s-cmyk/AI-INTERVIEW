import { NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { runEvaluation } from "../messages/route";
import type { SessionRow } from "@/lib/types";
import { requireApiKey, validateCustomBaseUrl } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().max(500).optional(),
  provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(1).default(0.4),
  maxTokens: z.number().int().min(64).max(32000).default(4096),
  topP: z.number().min(0).max(1).default(0.95),
});

export async function POST(req: Request, { params }: RouteParams) {
  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  if (body.provider === "custom") {
    const err = validateCustomBaseUrl(body.baseUrl ?? "");
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }
  const keyErr = requireApiKey(body.provider, body.apiKey);
  if (keyErr) return NextResponse.json({ ok: false, error: keyErr }, { status: 400 });

  try {
    await runEvaluation({
      sessionId: params.id,
      provider: body.provider,
      model: body.model,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      topP: body.topP,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
