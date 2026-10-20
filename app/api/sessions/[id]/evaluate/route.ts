import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { resolveSessionConfig } from "@/lib/providers/session-config";
import { claimEvaluation, evaluationIsStale, runEvaluation } from "@/lib/evaluation";
import type { SessionRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

export async function POST(req: Request, { params }: RouteParams) {
  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const parsed = parseModelConfig(await req.json().catch(() => null), apiKey, modelConfigInput);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const sessionConfig = resolveSessionConfig(session, parsed.cfg);
  if (!sessionConfig.ok) return NextResponse.json({ ok: false, error: sessionConfig.error }, { status: 409 });
  const { cfg } = sessionConfig;
  if (session.status !== "failed" && !evaluationIsStale(session)) {
    return NextResponse.json({ ok: false, error: "Evaluation is already running or finished" }, { status: 409 });
  }
  const attemptId = claimEvaluation(params.id, true);
  if (!attemptId) {
    return NextResponse.json({ ok: false, error: "Evaluation is already running or finished" }, { status: 409 });
  }

  try {
    await runEvaluation({
      sessionId: params.id,
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg._base,
      apiKey,
    }, attemptId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Không thể chấm điểm. Vui lòng thử lại." }, { status: 500 });
  }
}
