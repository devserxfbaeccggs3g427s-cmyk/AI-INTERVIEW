/**
 * Lớp AI dùng chung — client Anthropic, routing 16 mã, prompt caching,
 * structured output, chuỗi exception typed, chế độ offline, ghi log `AiCall`.
 *
 * ⚠️ QUY TẮC: chỉ file này được import `@anthropic-ai/sdk`.
 * Feature khác gọi qua `callAIJson()` / `streamAI()` — không import SDK trực tiếp
 * (registry §5: "Mọi lời gọi AI đi qua wrapper → tự ghi AiCall").
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { prisma } from "@/lib/db";

/* ══ Types ═════════════════════════════════════════════════════════════════ */

export type AIFeatureCode =
  | "AI-01" | "AI-02" | "AI-03" | "AI-04" | "AI-05" | "AI-06" | "AI-07" | "AI-08"
  | "AI-09" | "AI-10" | "AI-11" | "AI-12" | "AI-13" | "AI-14" | "AI-15" | "AI-16";

export type AIModel = "claude-opus-5" | "claude-haiku-4-5";
export type Effort = "low" | "medium" | "high";

export interface AIRoute {
  /** Slug ghi vào `AiCall.feature`. */
  readonly feature: string;
  readonly model: AIModel;
  readonly streaming: boolean;
  readonly effort: Effort;
  /** true nếu payload có cấu trúc (bắt buộc dùng `output_config.format`). */
  readonly structured: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AiResult<T> {
  data: T;
  usage: TokenUsage;
  model: AIModel;
  stopReason: Anthropic.StopReason | null;
}

export type AiStreamEvent =
  | { type: "text"; text: string }
  | { type: "json"; partial: string }
  | { type: "usage"; usage: TokenUsage };

export interface AIRequestOptions {
  /** Đã dựng sẵn qua `buildSystemBlocks()` — KHÔNG tự chế system array rồi rải. */
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** Mặc định 16000 cho payload dài. */
  maxTokens?: number;
  /**
   * Schema cho structured output **kèm streaming** (AI-01).
   * Khi có mặt, `output_config.format` được set và event `json` mang JSON
   * đã parse + validate (không phải text thô).
   */
  schema?: z.ZodType<unknown>;
}

/* ══ Bảng routing (SPEC §5.1) ═════════════════════════════════════════════ */

export const AI_ROUTES: Record<AIFeatureCode, AIRoute> = {
  "AI-01": { feature: "daily_plan", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-02": { feature: "quick_log_autofill", model: "claude-haiku-4-5", streaming: false, effort: "low", structured: true },
  "AI-03": { feature: "grading", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-04": { feature: "grading", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-05": { feature: "journal_feedback", model: "claude-opus-5", streaming: true, effort: "low", structured: true },
  "AI-06": { feature: "classify", model: "claude-haiku-4-5", streaming: false, effort: "low", structured: true },
  "AI-07": { feature: "weekly_review", model: "claude-opus-5", streaming: true, effort: "high", structured: true },
  "AI-08": { feature: "roleplay", model: "claude-opus-5", streaming: true, effort: "medium", structured: false },
  "AI-09": { feature: "language_practice", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-10": { feature: "language_practice", model: "claude-haiku-4-5", streaming: false, effort: "low", structured: true },
  "AI-11": { feature: "mock_interview", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-12": { feature: "mock_interview", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-13": { feature: "mock_interview", model: "claude-opus-5", streaming: true, effort: "high", structured: true },
  "AI-14": { feature: "language_test", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-15": { feature: "language_test", model: "claude-opus-5", streaming: true, effort: "medium", structured: true },
  "AI-16": { feature: "language_test", model: "claude-opus-5", streaming: false, effort: "low", structured: true },
};

/* ══ Bảng giá (SPEC §5.7) — USD / 1M token ════════════════════════════════ */

export const PRICING: Record<
  AIModel,
  { input: number; output: number; cacheWriteMultiplier: number; cacheReadMultiplier: number }
> = {
  // Claude Opus 5: $5 input / $25 output mỗi 1M token
  "claude-opus-5": { input: 5, output: 25, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  // Claude Haiku 4.5: $1 input / $5 output mỗi 1M token
  "claude-haiku-4-5": { input: 1, output: 5, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
};

/**
 * Ngưỡng cache tối thiểu theo model (token). Dưới ngưỡng → API **im lặng** không cache
 * (không lỗi, không cảnh báo) ⇒ chi phí tăng âm thầm. Đây là "silent invalidator".
 */
export const CACHE_MIN_TOKENS: Record<AIModel, number> = {
  "claude-opus-5": 512,
  "claude-haiku-4-5": 4096,
};

/* ══ Client singleton ══════════════════════════════════════════════════════ */

let clientSingleton: Anthropic | null = null;
let clientKey: string | null = null;

/** Key hiện tại; `null` khi chưa cấu hình (offline mode). */
export function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isAiAvailable(): boolean {
  return getApiKey() !== null;
}

export function createAnthropicClient(apiKey: string = getApiKey() ?? ""): Anthropic {
  // retry do wrapper kiểm soát — không để SDK tự retry ẩn.
  return new Anthropic({ apiKey, maxRetries: 0 });
}

/**
 * Singleton nhưng nhạy với thay đổi key: nếu key trong env đổi (user sửa ở S15),
 * client cũ bị thay để không giữ key cũ.
 */
export function getAnthropicClient(): Anthropic {
  const key = getApiKey() ?? "";
  if (!clientSingleton || clientKey !== key) {
    clientSingleton = createAnthropicClient(key);
    clientKey = key;
  }
  return clientSingleton;
}

/* ══ Chi phí ═══════════════════════════════════════════════════════════════ */

export function estimateCost(model: AIModel, usage: TokenUsage): number {
  const p = PRICING[model];
  const cost =
    (usage.inputTokens * p.input) / 1_000_000 +
    (usage.cacheWrite * p.input * p.cacheWriteMultiplier) / 1_000_000 +
    (usage.cacheRead * p.input * p.cacheReadMultiplier) / 1_000_000 +
    (usage.outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000; // USD, 6 chữ số thập phân
}

/* ══ Exception chain typed (SPEC §5.5) ════════════════════════════════════ */

export class AiError extends Error {
  constructor(
    readonly code: string, // mã lưu vào `AiCall.error`
    message: string,
    readonly userMessage: string, // thông báo tiếng Việt cho UI
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AiOfflineError extends AiError {
  constructor() {
    super(
      "offline_no_key",
      "ANTHROPIC_API_KEY is not configured",
      "Chưa có API key — tính năng AI đang tắt.",
      false,
    );
  }
}

export class AiAuthError extends AiError {
  constructor(cause?: unknown) {
    super("auth_failed", "Invalid API key", "API key không hợp lệ hoặc đã hết hạn.", false, cause);
  }
}

export class AiRateLimitError extends AiError {
  constructor(readonly retryAfterMs: number, cause?: unknown) {
    super(
      "rate_limited",
      `Rate limited, retry after ${retryAfterMs}ms`,
      "Đang bị giới hạn tốc độ, thử lại sau một chút.",
      true,
      cause,
    );
  }
}

export class AiApiStatusError extends AiError {
  constructor(readonly status: number, message: string, cause?: unknown) {
    super("api_error", `Anthropic API status ${status}: ${message}`, "Lỗi máy chủ AI. Vui lòng thử lại sau.", true, cause);
  }
}

export class AiConnectionError extends AiError {
  constructor(cause?: unknown) {
    super("connection_failed", "Connection to Anthropic API failed", "Không kết nối được máy chủ AI.", true, cause);
  }
}

export class AiTimeoutError extends AiError {
  constructor(cause?: unknown) {
    super("timeout", "Request to Anthropic API timed out", "AI phản hồi quá lâu. Vui lòng thử lại.", true, cause);
  }
}

export class AiRefusalError extends AiError {
  constructor() {
    super("refusal", "Model refused to answer", "AI không thể xử lý nội dung này. Bạn có thể diễn đạt lại.", false);
  }
}

export class AiSchemaError extends AiError {
  constructor(readonly issues: string[], cause?: unknown) {
    super(
      "schema_invalid",
      `Structured output failed validation: ${issues.join("; ")}`,
      "AI trả về dữ liệu không đúng cấu trúc. Đã ghi nhận lỗi.",
      true,
      cause,
    );
  }
}

export class AiMaxTokensError extends AiError {
  constructor() {
    super("max_tokens", "Response truncated at max_tokens", "Phản hồi bị cắt cụt, hãy thử lại.", true);
  }
}

export class AiStreamInterruptedError extends AiError {
  constructor(cause?: unknown) {
    super("stream_interrupted", "Stream interrupted", "Kết nối bị ngắt giữa chừng.", true, cause);
  }
}

/**
 * Bắt exception theo chuỗi typed của SDK (SPEC §5.5).
 *
 * ⚠️ SDK TypeScript **không có** `APIStatusError` (đó là tên của Python SDK).
 * Bản tương đương ở TS là `Anthropic.APIError` — đã bao gồm các subclass
 * theo status (BadRequest / NotFound / InternalServerError…).
 */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiAuthError(err);
  if (err instanceof Anthropic.RateLimitError) {
    const retryAfter = err.headers?.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : 5;
    const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : 5_000;
    return new AiRateLimitError(retryAfterMs, err);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AiTimeoutError(err);
  if (err instanceof Anthropic.APIConnectionError) return new AiConnectionError(err);
  if (err instanceof Anthropic.APIError) return new AiApiStatusError(err.status ?? 0, err.message, err);
  if (err instanceof Anthropic.AnthropicError) return new AiApiStatusError(0, err.message, err);
  return new AiApiStatusError(0, err instanceof Error ? err.message : String(err), err);
}

/* ══ Ghi log AiCall ════════════════════════════════════════════════════════ */

export interface AiCallMeta {
  feature: string;
  model: AIModel;
  streaming: boolean;
}

export async function logAiCall(
  meta: AiCallMeta,
  usage: TokenUsage | null,
  ok: boolean,
  error: string | null,
): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        feature: meta.feature,
        model: meta.model,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheRead: usage?.cacheRead ?? 0,
        cacheWrite: usage?.cacheWrite ?? 0,
        estimatedCost: usage ? estimateCost(meta.model, usage) : 0,
        ok,
        error,
      },
    });
  } catch (logErr) {
    // D9: lỗi ghi log KHÔNG được làm hỏng response của feature đang gọi.
    console.error("[anthropic] failed to write AiCall", logErr);
  }
}

/** Bọc run() để ghi log mọi lời gọi — thành công lẫn thất bại. */
export async function wrapWithLogging<T>(
  meta: AiCallMeta,
  run: () => Promise<AiResult<T>>,
): Promise<AiResult<T>> {
  try {
    const result = await run();
    await logAiCall(meta, result.usage, true, null);
    return result;
  } catch (err) {
    const aiErr = toAiError(err);
    await logAiCall(meta, null, false, aiErr.code);
    throw aiErr;
  }
}

function toUsage(u: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

/* ══ Structured output (không streaming) ═══════════════════════════════════ */

export async function callAIJson<T>(
  code: AIFeatureCode,
  schema: z.ZodType<T>,
  opts: AIRequestOptions,
): Promise<AiResult<T>> {
  const route = AI_ROUTES[code];
  const meta: AiCallMeta = { feature: route.feature, model: route.model, streaming: false };

  return wrapWithLogging<T>(meta, async () => {
    if (!isAiAvailable()) throw new AiOfflineError();

    const client = getAnthropicClient();
    const response = await client.messages.parse({
      model: route.model,
      max_tokens: opts.maxTokens ?? 16_000,
      system: opts.system,
      messages: opts.messages,
      output_config: {
        effort: route.effort,
        format: zodOutputFormat(schema),
      },
    });

    // D7: kiểm refusal TRƯỚC khi đọc content.
    if (response.stop_reason === "refusal") throw new AiRefusalError();
    if (response.stop_reason === "max_tokens") throw new AiMaxTokensError();

    const parsed = response.parsed_output;
    if (parsed === null || parsed === undefined) {
      throw new AiSchemaError(["parsed_output is empty"]);
    }
    // `parsed_output` đã được SDK parse bằng chính schema → không parse lần 2.
    return {
      data: parsed as T,
      usage: toUsage(response.usage),
      model: route.model,
      stopReason: response.stop_reason,
    };
  });
}

/* ══ Streaming ═════════════════════════════════════════════════════════════ */

export async function* streamAI(
  code: AIFeatureCode,
  opts: AIRequestOptions,
): AsyncGenerator<AiStreamEvent> {
  const route = AI_ROUTES[code];
  const meta: AiCallMeta = { feature: route.feature, model: route.model, streaming: true };

  let usage: TokenUsage | null = null;
  let stopReason: Anthropic.StopReason | null = null;

  try {
    if (!isAiAvailable()) throw new AiOfflineError();

    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: route.model,
      max_tokens: opts.maxTokens ?? 16_000,
      system: opts.system,
      messages: opts.messages,
      ...(opts.schema
        ? { output_config: { effort: route.effort, format: zodOutputFormat(opts.schema) } }
        : { output_config: { effort: route.effort } }),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          yield { type: "json", partial: event.delta.partial_json };
        }
      } else if (event.type === "message_start") {
        // usage đầu tiên: input + cache (output còn 0).
        const u = event.message.usage;
        if (u) {
          usage = {
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheWrite: u.cache_creation_input_tokens ?? 0,
          };
        }
      } else if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason ?? stopReason;
        // usage cuối: output tokens đầy đủ.
        const u = event.usage;
        if (u) {
          const prev: TokenUsage = usage ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheRead: 0,
            cacheWrite: 0,
          };
          usage = {
            inputTokens: prev.inputTokens,
            outputTokens: u.output_tokens ?? prev.outputTokens,
            cacheRead: prev.cacheRead,
            cacheWrite: prev.cacheWrite,
          };
        }
      }
    }

    // D7: refusal check SAU stream (stop_reason chỉ biết khi stream kết thúc).
    if (stopReason === "refusal") throw new AiRefusalError();
    if (stopReason === "max_tokens") throw new AiMaxTokensError();

    await logAiCall(meta, usage, true, null);
  } catch (err) {
    const aiErr = toAiError(err);
    await logAiCall(meta, usage, false, aiErr.code);
    throw aiErr;
  }

  if (usage) {
    yield { type: "usage", usage };
  }
}
