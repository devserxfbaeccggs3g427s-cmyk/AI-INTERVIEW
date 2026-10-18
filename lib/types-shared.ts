/** Types safe to import on the client (no node:sqlite references). */
export type { ProviderId, InterviewLanguage, InterviewMode, InterviewStatus, CVSource, ModelConfig, SessionRow, MessageTurnRow, CVExtractRow } from "./types";

import type { ProviderId } from "./types";

/** Heuristic detection of which provider a key is for, used by the BYOK UI. */
export function detectKeyProvider(key: string): ProviderId | null {
  if (!key) return null;
  if (/^sk-ant-/i.test(key)) return "anthropic";
  if (/^sk-(proj-)?/i.test(key)) return "openai";
  if (/^AIza/i.test(key)) return "gemini";
  return null;
}
