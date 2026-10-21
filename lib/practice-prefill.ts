import { FocusSchema } from "./focus";

type Language = "vi" | "en";

export interface PracticePrefill {
  role: string;
  language: Language;
  focus: string[];
}

const ALLOWED_KEYS = new Set(["role", "language", "focus"]);
const MAX_ROLE_LENGTH = 120;
// Four 120-character fields can expand beyond 4 KiB when UTF-8 is URI-encoded.
const MAX_QUERY_LENGTH = 8192;
const hasControlCharacters = (text: string) => /[\x00-\x1f\x7f-\x9f]/.test(text);

/** Report prose is untrusted. Use only short plain-text labels, never markup or a report body. */
export function practiceFocusLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\x00-\x1f\x7f-\x9f<>`*_#[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return FocusSchema.safeParse([label]).success ? label : null;
}

/** The only data allowed into the practice URL is role, language, and up to three focus labels. */
export function encodePracticePrefill(input: PracticePrefill): string | null {
  const role = input.role.trim();
  const focus = FocusSchema.safeParse(input.focus);
  if (role.length < 2 || role.length > MAX_ROLE_LENGTH || hasControlCharacters(role) ||
      !["vi", "en"].includes(input.language) || !focus.success ||
      focus.data.some(hasControlCharacters)) return null;
  const params = new URLSearchParams({ role, language: input.language });
  for (const label of focus.data) params.append("focus", label);
  const query = params.toString();
  return query.length <= MAX_QUERY_LENGTH ? `/new?${query}` : null;
}

/** Reject extra fields (including secrets), duplicate scalar fields and malformed/oversized inputs. */
export function decodePracticePrefill(query: string): PracticePrefill | null {
  const raw = query.startsWith("?") ? query.slice(1) : query;
  if (!raw || raw.length > MAX_QUERY_LENGTH || raw.includes("#") || /%(?![\da-fA-F]{2})/.test(raw)) return null;
  try {
    // URLSearchParams replaces malformed UTF-8 with U+FFFD; do not silently accept it.
    for (const component of raw.split(/[&=]/)) decodeURIComponent(component.replace(/\+/g, " "));
  } catch {
    return null;
  }
  const params = new URLSearchParams(raw);
  if ([...params.keys()].some((key) => !ALLOWED_KEYS.has(key)) ||
      params.getAll("role").length !== 1 || params.getAll("language").length !== 1 ||
      params.getAll("focus").length > 3) return null;
  const role = params.get("role")!;
  const language = params.get("language")!;
  const focus = FocusSchema.safeParse(params.getAll("focus"));
  if (role !== role.trim() || role.length < 2 || role.length > MAX_ROLE_LENGTH ||
      hasControlCharacters(role) || (language !== "vi" && language !== "en") ||
      !focus.success || focus.data.some(hasControlCharacters)) return null;
  return { role, language, focus: focus.data };
}
