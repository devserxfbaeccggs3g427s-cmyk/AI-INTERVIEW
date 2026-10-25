import { z } from "zod";

export const MAX_COACHING_CHARS = 8000;

const Rubric = z.object({
  score: z.number().finite().min(0).max(100),
  strengths: z.array(z.string().trim().min(1).max(500)).min(1).max(4),
  improvements: z.array(z.string().trim().min(1).max(500)).min(1).max(4),
});

function validated(value: unknown) {
  const parsed = Rubric.safeParse(value);
  return parsed.success ? { ...parsed.data, score: Math.round(parsed.data.score) } : null;
}

/** Accept a JSON object inside a fence or short prose, but never invent a score. */
export function extractCoachingRubric(text: string) {
  if (text.length > MAX_COACHING_CHARS) return null;
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          const parsed = validated(JSON.parse(text.slice(start, end + 1)));
          if (parsed) return parsed;
        } catch { /* Look for another complete object. */ }
        break;
      }
    }
  }
  // Some local models ignore the JSON contract but provide an explicitly
  // labeled score and one-line feedback. Never infer a score from free prose.
  const score = text.match(/^\s*(?:\*{0,2})?(?:điểm|score)\*{0,2}\s*[:：]\s*(\d{1,3})(?:\s*\/\s*100)?\s*$/im);
  const strengths = text.match(/^\s*(?:[✓*+-]\s*)?(?:điểm tốt|điểm mạnh|strengths?)\s*[:：]\s*(.+)$/im);
  const improvements = text.match(/^\s*(?:[!*+-]\s*)?(?:gợi ý cải thiện|cải thiện|improvements?)\s*[:：]\s*(.+)$/im);
  if (score && strengths && improvements) {
    return validated({ score: Number(score[1]), strengths: [strengths[1]], improvements: [improvements[1]] });
  }
  return null;
}
