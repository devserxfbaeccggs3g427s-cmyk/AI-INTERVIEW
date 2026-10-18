/**
 * Shared domain types (server ↔ client).
 * Kept framework-agnostic so we can reuse them in both Server Components and route handlers.
 */

export type ProviderId = "anthropic" | "openai" | "gemini" | "custom";
export type InterviewLanguage = "vi" | "en";
export type InterviewMode = "strict" | "coaching";
export type InterviewStatus = "active" | "evaluating" | "completed" | "failed";
export type CVSource = "none" | "paste" | "pdf";

export interface ModelConfig {
  provider: ProviderId;
  model: string;
  base_url?: string | null;
  temperature: number;
  max_tokens: number;
  top_p: number;
}

/** A persisted row from `sessions`, augmented with the latest eval if any. */
export interface SessionRow extends ModelConfig {
  id: string;
  role: string;
  language: InterviewLanguage;
  mode: InterviewMode;
  planned_rounds: number;
  status: InterviewStatus;
  cv_source: CVSource | null;
  cv_filename: string | null;
  created_at: number;
  ended_at: number | null;
  rubric_json: string | null;
  error_count: number;
  /** Joined-in evaluation summary (if any). */
  overall_score?: number | null;
  recommendation?: string | null;
  evaluated_turns?: number | null;
}

export interface MessageTurnRow {
  id: number;
  session_id: string;
  turn_number: number;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  raw_blocks_json: string | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  micro_rubric: string | null;
  finish_reason: string | null;
  created_at: number;
}

export interface CVExtractRow {
  id: number;
  session_id: string;
  source: CVSource;
  filename: string | null;
  text: string;
  char_count: number;
  created_at: number;
}

/** Per-provider catalogue used by the BYOK model picker (FR-14, FR-16). */
export const PROVIDER_MODELS: Record<ProviderId, { id: string; label: string }[]> = {
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Coding & System)" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (siêu tốc)" },
    { id: "claude-3-opus-20240229", label: "Claude 3 Opus (chiều sâu)" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o (Omni Balanced)" },
    { id: "gpt-4o-mini", label: "GPT-4o mini (tốc độ / tiết kiệm)" },
    { id: "o1-preview", label: "o1-preview (Reasoning)" },
    { id: "o1-mini", label: "o1-mini (Reasoning nhanh)" },
  ],
  gemini: [
    { id: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (2M tokens)" },
    { id: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (tức thì)" },
  ],
  custom: [
    { id: "custom-model-local", label: "Tự nhập Model ID — fetch từ Base URL" },
  ],
};

export const ROUND_LENGTHS = [5, 8, 12] as const;
export type RoundLength = (typeof ROUND_LENGTHS)[number];

/** Quick role suggestions (FR-1 quick-fill chips). */
export const ROLE_CHIPS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Senior Frontend (React/TS)", value: "Senior Frontend (React / TypeScript)" },
  { label: "Backend Go/Distributed", value: "Backend Go / Distributed Systems" },
  { label: "Fullstack Node/Next.js", value: "Fullstack Node / Next.js / Cloud" },
  { label: "AI/ML Engineer (LLMOps)", value: "AI/ML Engineer (LLMOps & RAG)" },
  { label: "Staff System Architect", value: "Staff System Architect" },
  { label: "Product Manager (Technical)", value: "Technical Product Manager (TPM)" },
  { label: "DevOps / SRE", value: "Site Reliability Engineer (DevOps/SRE)" },
];

/** Best-effort labelling of which provider a key looks like (FR-13 format detection). */
export function detectKeyProvider(apiKey: string): ProviderId | "unknown" {
  const k = apiKey.trim();
  if (!k) return "unknown";
  if (k.startsWith("sk-ant-") || k.startsWith("ant-")) return "anthropic";
  if (k.startsWith("sk-proj-") || k.startsWith("sk-")) return "openai";
  if (k.startsWith("AIza")) return "gemini";
  return "unknown";
}
