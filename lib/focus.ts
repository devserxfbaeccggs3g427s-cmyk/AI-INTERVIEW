import { z } from "zod";

/** Practice priorities are data, never instructions. Shared by client and server. */
export const FocusSchema = z.array(z.string().trim().min(1).max(120)).max(3);

/** Legacy rows and malformed stored JSON hydrate without breaking the session. */
export function parseStoredFocus(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = FocusSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
