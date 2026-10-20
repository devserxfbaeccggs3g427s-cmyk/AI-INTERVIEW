// Client-safe provider catalogue. Do not import server-only modules here.
// NEXT_PUBLIC_PROVIDER_ENABLE is embedded at build time for both client and server.

type TagTone = "emerald" | "neutral" | "indigo" | "amber";

interface ProviderSpec {
  title: string;
  subtitle: string;
  tags: readonly { label: string; tone: TagTone }[];
  icon: string;
  models: readonly { id: string; label: string }[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  keyPatterns: readonly RegExp[];
  keyHint: string;
  disabledReason: string;
  preferred: boolean;
  /** Implementation is safe to expose when explicitly enabled. */
  ready: boolean;
  enabledByDefault: boolean;
}

export const PROVIDER_REGISTRY = {
  anthropic: {
    title: "Anthropic",
    subtitle: "Claude 3.5 Sonnet / 3.5 Haiku",
    tags: [{ label: "Direct PDF", tone: "emerald" }, { label: "Streaming", tone: "indigo" }],
    icon: "terminal",
    models: [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Coding & System)" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (siêu tốc)" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus (chiều sâu)" },
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
    keyPatterns: [/^sk-ant-/i, /^ant-/i],
    keyHint: "Định dạng: sk-ant-…",
    disabledReason: "Anthropic đang tạm khóa trong cấu hình server.",
    preferred: false,
    ready: true,
    enabledByDefault: true,
  },
  openai: {
    title: "OpenAI",
    subtitle: "GPT-4o / GPT-4o mini / o1",
    tags: [
      { label: "Direct PDF", tone: "emerald" },
      { label: "JSON Schema", tone: "emerald" },
      { label: "Streaming", tone: "indigo" },
    ],
    icon: "psychology",
    models: [
      { id: "gpt-4o", label: "GPT-4o (Omni Balanced)" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (tốc độ / tiết kiệm)" },
      { id: "o1-preview", label: "o1-preview (Reasoning)" },
      { id: "o1-mini", label: "o1-mini (Reasoning nhanh)" },
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
    keyPatterns: [/^sk-(proj-)?/i],
    keyHint: "Định dạng: sk-proj-…",
    disabledReason: "OpenAI đang tạm khóa trong cấu hình server.",
    preferred: true,
    ready: true,
    enabledByDefault: true,
  },
  gemini: {
    title: "Google Gemini",
    subtitle: "Gemini 1.5 Pro / Flash",
    tags: [{ label: "Direct PDF", tone: "emerald" }, { label: "Multi-modal", tone: "neutral" }, { label: "Streaming", tone: "indigo" }],
    icon: "diamond",
    models: [
      { id: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (2M tokens)" },
      { id: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (tức thì)" },
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
    keyPatterns: [/^AIza/i],
    keyHint: "Định dạng: AIzaSy…",
    disabledReason: "Google Gemini đang tạm khóa trong cấu hình server.",
    preferred: false,
    ready: true,
    enabledByDefault: true,
  },
  custom: {
    title: "Tùy chỉnh",
    subtitle: "OpenAI-compatible · local hoặc public",
    tags: [],
    icon: "hub",
    models: [{ id: "custom-model-local", label: "Tự nhập Model ID — fetch từ Base URL" }],
    requiresApiKey: false,
    requiresBaseUrl: true,
    keyPatterns: [],
    keyHint: "Tùy biến (OpenAI Compatible)",
    disabledReason: "Custom provider chưa được bật trong NEXT_PUBLIC_PROVIDER_ENABLE.",
    preferred: false,
    ready: true,
    enabledByDefault: false,
  },
} as const satisfies Record<string, ProviderSpec>;

export type ProviderId = keyof typeof PROVIDER_REGISTRY;
export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY) as ProviderId[];
const DEFAULT_ENABLED: readonly ProviderId[] = PROVIDER_IDS.filter((id) => PROVIDER_REGISTRY[id].ready && PROVIDER_REGISTRY[id].enabledByDefault);

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, value);
}

const configured = process.env.NEXT_PUBLIC_PROVIDER_ENABLE;
const enabledIds = configured === undefined
  ? DEFAULT_ENABLED
  : configured.split(",").map((id) => id.trim());

export const ENABLED_PROVIDER_IDS = PROVIDER_IDS.filter(
  (id) => PROVIDER_REGISTRY[id].ready && enabledIds.includes(id),
);

export function isProviderEnabled(id: ProviderId): boolean {
  return ENABLED_PROVIDER_IDS.includes(id);
}

export function getProviderSpec(id: ProviderId): ProviderSpec {
  return PROVIDER_REGISTRY[id];
}

export function detectProviderFromKey(key: string): ProviderId | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  return PROVIDER_IDS.find((id) => PROVIDER_REGISTRY[id].keyPatterns.some((pattern) => pattern.test(trimmed))) ?? null;
}
