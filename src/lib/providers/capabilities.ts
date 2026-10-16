/**
 * Ma trận năng lực — khớp docs/02-DESIGN.md §4.2–§4.3.
 *
 * Quy tắc của file này, không ngoại lệ:
 *   1. Mặc định mọi cờ là `false`.
 *   2. Một cờ chỉ `true` khi tài liệu hãng xác nhận, và phải kèm URL trong `EVIDENCE`.
 *   3. Năng lực thuộc về **model** chứ không thuộc hãng thì tra theo model.
 *      Danh sách model của provider KHÔNG phải bằng chứng cho tính năng (FR-16).
 *
 * File KHÔNG import SDK: nó được UI import để tắt cờ không dùng được.
 */

import type { Capability, ProviderId, ReasoningLevel } from "./types";

/** Nguồn cho từng kết luận. Thiếu mục này thì cờ tương ứng phải là `false`. */
const EVIDENCE = {
  anthropicStreaming:
    "https://platform.claude.com/docs/en/build-with-claude/streaming",
  anthropicStructured:
    "https://platform.claude.com/docs/en/build-with-claude/structured-outputs",
  anthropicPdf:
    "https://platform.claude.com/docs/en/build-with-claude/pdf-support",
  anthropicModelCaps:
    "https://platform.claude.com/docs/en/api/models/list",
  openaiStructured:
    "https://developers.openai.com/api/docs/guides/structured-outputs",
  openaiPdf: "https://developers.openai.com/api/docs/guides/pdf-files",
  openaiReasoning: "https://developers.openai.com/api/docs/guides/reasoning",
  openaiCache: "https://developers.openai.com/api/docs/guides/prompt-caching",
  geminiStructured:
    "https://ai.google.dev/gemini-api/docs/structured-output",
  geminiThinking: "https://ai.google.dev/gemini-api/docs/thinking",
  geminiPdf: "https://ai.google.dev/gemini-api/docs/document-processing",
  customBaseUrl: "https://github.com/openai/openai-node",
} as const;

export const ALL_REASONING_LEVELS: readonly ReasoningLevel[] = [
  "off",
  "low",
  "medium",
  "high",
];

/** Năng lực ở mức **provider** — phần chắc chắn đúng ở mọi model của hãng. */
const PROVIDER_BASELINE: Record<ProviderId, Capability> = {
  anthropic: {
    streaming: true,
    structuredOutput: true,
    readsPdf: true,
    reasoning: true,
    midConversationSystem: true,
    explicitCache: true,
    reportsCacheUsage: true,
    modelListCarriesCapabilities: true,
    supportsDirect: true,
    reasoningLevels: ALL_REASONING_LEVELS,
  },
  openai: {
    streaming: true,
    // Không bật ở mức provider: structured output chỉ từ gpt-4o-mini trở lên,
    // còn đọc PDF và suy luận đều phụ thuộc model. Xem MODEL_OVERRIDES.
    structuredOutput: false,
    readsPdf: false,
    reasoning: false,
    midConversationSystem: false,
    // OpenAI cache tự động, không có điểm ghi tường minh.
    explicitCache: false,
    reportsCacheUsage: true,
    // GET /v1/models không trả cờ năng lực.
    modelListCarriesCapabilities: false,
    supportsDirect: true,
    reasoningLevels: [],
  },
  gemini: {
    streaming: true,
    structuredOutput: true,
    readsPdf: true,
    reasoning: true,
    midConversationSystem: false,
    // Chỉ cache ngầm định ở các bản mới; không có `cache_control` tường minh.
    explicitCache: false,
    reportsCacheUsage: true,
    modelListCarriesCapabilities: false,
    supportsDirect: true,
    // Tập mức hợp lệ khác nhau theo model — xem MODEL_OVERRIDES.
    reasoningLevels: [],
  },
  custom: {
    // Adapter CÓ hiện thực luồng SSE. Endpoint có trả SSE hay không thì phát
    // hiện lúc chạy — một endpoint không hỗ trợ sẽ báo lỗi, không rơi về kiểu
    // không luồng một cách lặng lẽ. Cờ này nói "adapter làm được", không nói
    // "mọi endpoint đều làm được" — UI vẫn phải xử lý lỗi của chế độ này.
    streaming: true,
    structuredOutput: false,
    readsPdf: false,
    reasoning: false,
    midConversationSystem: false,
    explicitCache: false,
    reportsCacheUsage: false,
    modelListCarriesCapabilities: false,
    // URL tùy ý: trình duyệt không kiểm tra được địa chỉ đích. Xem §10.3.
    supportsDirect: false,
    reasoningLevels: [],
  },
};

/**
 * Ghi đè theo model cho provider không đồng nhất. Mỗi mục chỉ được ghi khi tài liệu
 * nói rõ; thiếu mục nghĩa là dùng mức provider — và mức provider đã là `false`.
 */
const MODEL_OVERRIDES: Record<ProviderId, Record<string, Partial<Capability>>> = {
  anthropic: {
    // `GET /v1/models` trả cờ theo từng model; adapter đọc trực tiếp khi có key.
    // Ở đây chỉ ghi những model đã biết là **không** đọc PDF.
    "claude-haiku-4-5": { readsPdf: false },
  },
  openai: {
    "gpt-4o": {
      structuredOutput: true,
      readsPdf: true,
      reasoning: false,
      reasoningLevels: [],
    },
    "gpt-4o-mini": {
      structuredOutput: true,
      readsPdf: true,
      reasoning: false,
      reasoningLevels: [],
    },
    "o3": {
      structuredOutput: true,
      readsPdf: false,
      reasoning: true,
      reasoningLevels: ["low", "medium", "high"],
    },
    // Mức hợp lệ khác nhau theo từng model: có model trả 400 khi nhận `none`.
    "gpt-5": {
      structuredOutput: true,
      readsPdf: true,
      reasoning: true,
      reasoningLevels: ["low", "medium", "high"],
    },
    "gpt-5-mini": {
      structuredOutput: true,
      readsPdf: true,
      reasoning: true,
      reasoningLevels: ["low", "medium", "high"],
    },
  },
  gemini: {
    // `thinkingLevel` không phải ngân sách token, và tập mức khác nhau theo model.
    "gemini-2.5-flash-lite": {
      reasoning: true,
      reasoningLevels: ["off", "low", "medium", "high"],
    },
    "gemini-2.5-pro": {
      reasoning: true,
      reasoningLevels: ["low", "high"],
    },
    "gemini-3-pro-preview": {
      reasoning: true,
      reasoningLevels: ["low", "high"],
    },
    "gemini-3.6-flash": {
      reasoning: true,
      reasoningLevels: ["off", "low", "medium", "high"],
    },
  },
  custom: {},
};

/** Năng lực provider sau khi áp mức mặc định. */
export function providerCapabilities(id: ProviderId): Capability {
  return PROVIDER_BASELINE[id];
}

/**
 * Năng lực thật của một cặp provider + model.
 *
 * Gọi hàm này trước khi gửi tham số phụ thuộc model: gửi `thinkingLevel` tới một
 * model không nhận là 400, và lỗi đó hiện ra với người dùng dưới dạng thông báo vô nghĩa.
 */
export function capabilitiesFor(
  id: ProviderId,
  model: string,
): Capability {
  const base = PROVIDER_BASELINE[id];
  const override = MODEL_OVERRIDES[id][model];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Mức suy luận đã được model này xác nhận chấp nhận, hoặc `null` nếu không đổi được.
 *
 * `null` nghĩa là **bỏ hẳn tham số** — không phải "gửi mức không hợp lệ". Riêng `off`
 * luôn hợp lệ ở mọi provider: họ đều hiểu là không suy luận.
 */
export function supportedReasoningLevel(
  id: ProviderId,
  model: string,
  level: ReasoningLevel,
): ReasoningLevel | null {
  if (level === "off") return "off";
  const caps = capabilitiesFor(id, model);
  if (!caps.reasoning) return null;
  return caps.reasoningLevels.includes(level) ? level : null;
}

export const CAPABILITY_EVIDENCE = EVIDENCE;