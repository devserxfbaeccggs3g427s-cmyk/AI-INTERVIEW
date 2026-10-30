/**
 * DTO dùng chung.
 *
 * Dùng cho cả Server Component và Client Component — không import Prisma types
 * vào phía client để tránh kéo `@prisma/client` vào bundle.
 */

export const DOMAINS = [
  "professional",
  "communication",
  "language",
  "personal",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

export const ACTIVITY_TYPES = [
  "study",
  "write",
  "speak",
  "roleplay",
  "srs",
  "journal",
  "health",
  "custom",
  "mock_interview",
  "test",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  study: "Học",
  write: "Viết",
  speak: "Nói",
  roleplay: "Roleplay",
  srs: "Ôn tập",
  journal: "Nhật ký",
  health: "Chăm sóc bản thân",
  custom: "Khác",
  mock_interview: "Mock Interview",
  test: "Bài kiểm tra",
};

/** Rating bằng chứng 1..4 — 3 trở lên mới tính tăng level (FR-SK-03). */
export const EVIDENCE_RATINGS = [1, 2, 3, 4] as const;
export type EvidenceRating = (typeof EVIDENCE_RATINGS)[number];

export const RATING_LABELS: Record<EvidenceRating, string> = {
  1: "Yếu",
  2: "Tạm",
  3: "Khá",
  4: "Tốt",
};

/** 6 slot cố định của Daily Loop (SPEC.md §2.1). */
export const SLOT_COUNT = 6;

export type PlanSlot = {
  slot: number;
  domain: Domain;
  action: string;
  detail: string | null;
  minutes: number;
  skillId: string | null;
  done: boolean;
  source: "ai" | "manual" | "fallback";
};

/** Ngày trạng thái sinh trắc. */
export type DailyStateDTO = {
  date: string;
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  focus: number | null;
  note: string | null;
};

/** Kết quả gọi AI — luôn kèm provider thật đã trả lời (FR-AI-11). */
export type AiCallMeta = {
  provider: "local" | "anthropic";
  model: string;
  effort?: "low" | "medium" | "high";
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
  latencyMs: number;
  fallbackFrom?: string | null;
};

/** Envelope trả về cho mọi route AI — không bao giờ trả lỗi trần (design.md §7.2). */
export type AiEnvelope<T> =
  | { ok: true; data: T; meta: AiCallMeta }
  | { ok: false; error: { code: string; message: string } };

/** Nhãn badge provider ở header — đọc từ `AiCall.provider`, không hardcode (FR-AI-11). */
export function providerBadge(meta: Pick<AiCallMeta, "provider" | "model">): string {
  if (meta.provider === "local") {
    return "AI Offline / Local (Ollama)";
  }
  if (meta.model.startsWith("claude-haiku")) {
    return "AI Online / Cloud (Claude Haiku 4.5)";
  }
  return "AI Online / Cloud (Claude Opus 5)";
}
