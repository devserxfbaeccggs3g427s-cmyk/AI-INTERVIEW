import { queryOne } from "@/lib/db";
import { modelConfigInput, parseModelConfig } from "@/lib/providers/parse";
import { resolveSessionConfig } from "@/lib/providers/session-config";
import { claimEvaluation, evaluationIsStale, runEvaluation } from "@/lib/evaluation";
import type { SessionRow } from "@/lib/types";
import { env } from "@/lib/env";
import { privateJson, rejectCrossOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams { params: { id: string } }

export async function POST(req: Request, { params }: RouteParams) {
  const denied = rejectCrossOrigin(req, env.PUBLIC_ORIGIN);
  if (denied) return denied;
  const session = queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [params.id]);
  if (!session) return privateJson({ ok: false, error: "Session not found" }, { status: 404 });

  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const parsed = parseModelConfig(await req.json().catch(() => null), apiKey, modelConfigInput);
  if (!parsed.ok) return privateJson({ ok: false, error: parsed.error }, { status: 400 });
  const sessionConfig = resolveSessionConfig(session, parsed.cfg);
  if (!sessionConfig.ok) return privateJson({ ok: false, error: sessionConfig.error }, { status: 409 });
  const { cfg } = sessionConfig;
  if (session.status !== "failed" && !evaluationIsStale(session)) {
    return privateJson({ ok: false, error: "Evaluation is already running or finished" }, { status: 409 });
  }
  const attemptId = claimEvaluation(params.id, true);
  if (!attemptId) {
    return privateJson({ ok: false, error: "Evaluation is already running or finished" }, { status: 409 });
  }

  try {
    await runEvaluation({
      sessionId: params.id,
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg._base,
      apiKey,
    }, attemptId);
    return privateJson({ ok: true });
  } catch {
    return privateJson({ ok: false, error: "Không thể chấm điểm. Vui lòng thử lại." }, { status: 500 });
  }
}
