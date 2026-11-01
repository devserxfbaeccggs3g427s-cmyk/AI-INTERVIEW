import { z } from "zod";

import { fail, ok, toResponse } from "@/lib/api-response";
import { getProgress, getSkillTrajectories } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  domain: z.enum(["all", "professional", "communication", "language", "personal"]).default("all"),
  days: z.coerce.number().int().min(30).max(365).default(180),
});

/**
 * GET /api/progress?domain=all&days=180 — báo cáo tiến bộ (S14).
 *
 * ⚠️ FR-PR-07: mọi số liệu gắn với skill — không "tổng giờ học" trần trụi.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    domain: url.searchParams.get("domain") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
  });

  if (!parsed.success) {
    return toResponse(
      fail("invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")),
    );
  }

  const [report, trajectories] = await Promise.all([
    getProgress({ domain: parsed.data.domain, days: parsed.data.days }),
    getSkillTrajectories(parsed.data.days),
  ]);

  return toResponse(ok({ ...report, trajectories }));
}
