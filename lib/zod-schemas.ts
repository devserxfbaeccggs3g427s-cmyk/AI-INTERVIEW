/**
 * Zod schemas — the single source of truth for cross-provider report shape (FR-17).
 *
 * Used in three places:
 *   1. Provider prompt → guided JSON output (parse via safeParseStructured).
 *   2. Server-side validation of stored report_json before serving to the client.
 *   3. Auto-repair: if a model returns near-valid JSON we try one repair then store schema_valid=0
 *      and store the raw text alongside.
 */
import { z } from "zod";

const Score = z.number().int().min(0).max(100);

export const PillarSchema = z.object({
  score: Score,
  headline: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000),
  evidence_quote: z.string().max(800).optional().default(""),
});
export type Pillar = z.infer<typeof PillarSchema>;

export const TurnEvalSchema = z.object({
  turn_number: z.number().int().min(1),
  topic: z.string().min(1).max(200),
  pillar_scores: z.object({
    content: Score,
    relevance: Score,
    clarity: Score,
    depth: Score,
  }),
  micro_rubric: z.object({
    score: Score.optional(),
    strengths: z.array(z.string().max(400)).max(6).default([]),
    improvements: z.array(z.string().max(400)).max(6).default([]),
  }),
  standout_quote: z.string().max(800).optional().default(""),
});
export type TurnEval = z.infer<typeof TurnEvalSchema>;

export const Recommendation = z.enum([
  "Strong Hire",
  "Hire",
  "Lean Hire",
  "Lean No-Hire",
  "No-Hire",
  "Needs Improvement",
]);

export const EvaluationReportSchema = z.object({
  schema_version: z.literal("v1"),
  generated_at: z.string(), // ISO timestamp — set server-side, provider output may omit.
  overall_score: Score,
  recommendation: Recommendation,
  pillars: z.object({
    content: PillarSchema,
    relevance: PillarSchema,
    clarity: PillarSchema,
    depth: PillarSchema,
  }),
  strengths: z.array(z.string().min(1).max(400)).min(1).max(8),
  improvements: z.array(z.string().min(1).max(400)).min(1).max(8),
  per_turn: z.array(TurnEvalSchema).min(1),
  next_steps: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        description: z.string().min(1).max(600),
        duration: z.string().min(1).max(60),
      }),
    )
    .min(3)
    .max(5),
  hiring_probability_pct: Score.optional().default(0),
});
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

/**
 * Best-effort JSON parser with optional light repair. Returns undefined on hard failure.
 *
 * 1. Try strict JSON.parse.
 * 2. Strip ```json ... ``` fences.
 * 3. Try to locate the first {...} or [...] block.
 * 4. Validate with the schema.
 */
export function parseEvaluation(
  raw: string,
): { ok: true; data: EvaluationReport; repaired: boolean } | { ok: false; error: string } {
  const attempts: string[] = [raw];

  // Strip markdown fences.
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fence) attempts.push(fence[1].trim());

  // Find a JSON block by brace matching.
  const start = raw.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          attempts.push(raw.slice(start, i + 1));
          break;
        }
      }
    }
  }

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    const candidate = attempts[i];
    try {
      const parsed = JSON.parse(candidate);
      const result = EvaluationReportSchema.safeParse({
        ...parsed,
        generated_at: new Date().toISOString(),
      });
      if (result.success) {
        return { ok: true, data: result.data, repaired: i > 0 };
      }
      errors.push(result.error.message);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { ok: false, error: errors.join(" | ") };
}

/** Used in API responses so we don't accidentally leak garbage to the client. */
export function safeParseStoredReport(json: string): EvaluationReport | null {
  try {
    const obj = JSON.parse(json);
    const result = EvaluationReportSchema.safeParse(obj);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
