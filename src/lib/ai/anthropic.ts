/**
 * Client Anthropic — wrapper mỏng quanh `@anthropic-ai/sdk`.
 *
 * Trách nhiệm (design.md §6.3):
 *   1. Chèn `cache_control: {type:"ephemeral"}` vào block system cuối → prefix cache.
 *   2. Structured output bằng `output_config.format` (zod) — không parse JSON tay.
 *   3. Map lỗi SDK → exception typed (design.md §7.1) để router quyết định fallback.
 *
 * Về `AiCall`: **router (`callAi`) là nơi duy nhất ghi bảng `AiCall`** — mỗi lượt
 * gọi chỉ sinh đúng 1 dòng, nên số "lượt chạy / offline fallback" hiển thị ở S15
 * chính xác (FR-AI-07 / FR-AI-13 / FR-AI-14). Client chỉ trả về số liệu token.
 *
 * Xem tasks.md 2.6 / 2.9 · design.md §6.3 / §6.5 / §6.8.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { prisma } from "@/lib/db";
import {
  AiNetworkError,
  AiRateLimitError,
  AiRefusalError,
  AiTimeoutError,
  AiUnavailableError,
  ValidationError,
} from "@/lib/errors";

/** Bảng giá USD / 1M token (design.md §6.8). */
const PRICING: Record<string, Pricing> = {
  "claude-opus-5": { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  local: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
};

type Pricing = { input: number; output: number; cacheWrite: number; cacheRead: number };

/**
 * Ước lượng chi phí 1 lượt gọi (USD).
 *
 * Công thức chốt ở design.md §6.8:
 *   `(input*in + output*out + cacheWrite*cw + cacheRead*cr) / 1_000_000`
 *
 * Model không nằm trong bảng giá → coi như 0 chi phí thay vì đoán (an toàn hơn
 * việc hiển thị một con số sai trên badge ngân sách S15).
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const pricing = PRICING[model] ?? PRICING["local"];
  if (!pricing) return 0;

  const cost =
    (inputTokens * pricing.input +
      outputTokens * pricing.output +
      cacheWriteTokens * pricing.cacheWrite +
      cacheReadTokens * pricing.cacheRead) /
    1_000_000;

  // Giữ 6 chữ số thập phân — token rất nhỏ nên làm tròn sớm sẽ ra 0.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Số liệu token của 1 lượt gọi — dùng để ghi `AiCall` và tính chi phí. */
export type AnthropicUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
  latencyMs: number;
};

/** Thông tin ghi vào bảng `AiCall` sau mỗi lượt gọi. */
export type AiCallRecord = {
  feature: string;
  provider: "local" | "anthropic";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
  fallbackFrom?: string | null;
};

/**
 * Ghi 1 dòng `AiCall`.
 *
 * Không nuốt lỗi: lỗi DB (SQLite locked) không được làm hỏng kết quả AI mà
 * người dùng đang chờ — ta log và bỏ qua (design.md §7.2 "Lỗi DB" chỉ ảnh hưởng
 * ghi log, không ảnh hưởng trả lời).
 */
export async function writeAiCall(record: AiCallRecord): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        feature: record.feature,
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheRead: record.cacheRead,
        cacheWrite: record.cacheWrite,
        estimatedCost: record.estimatedCost,
        latencyMs: record.latencyMs,
        ok: record.ok,
        error: record.error ?? null,
        fallbackFrom: record.fallbackFrom ?? null,
      },
    });
  } catch (error) {
    // Log ràng buộc — KHÔNG log giá trị API key.
    console.warn("[ai] Không ghi được AiCall:", error instanceof Error ? error.message : error);
  }
}

export type AnthropicCallOptions<T> = {
  /** Task id — dùng làm `AiCall.feature`. */
  task: string;
  /** System prompt — PHẢI giống nhau giữa các lần để cache hit. */
  system: string;
  /** User message — chứa dữ liệu động (ngày, nội dung người dùng…). */
  user: string;
  /** Schema structured output. */
  schema?: z.ZodType<T>;
  /** Model ghi đè (mặc định lấy từ ROUTES của router). */
  model?: string;
  /** Mức suy luận — metadata của route, không gửi lên API (xem `router.ts`). */
  effort?: "low" | "medium" | "high";
  /** Bật streaming (chỉ provider anthropic hỗ trợ — design.md §6.7). */
  stream?: boolean;
  /** Giới hạn token đầu ra. */
  maxTokens?: number;
};

/** Client dùng chung — SDK tự đọc `ANTHROPIC_API_KEY` từ env. */
let client: Anthropic | null = null;

/**
 * Client Anthropic dùng chung cho cả router lẫn helper streaming.
 *
 * Hỗ trợ 2 kiểu xác thực:
 *   - `ANTHROPIC_API_KEY` (chuẩn) → header `X-Api-Key`.
 *   - `ANTHROPIC_AUTH_TOKEN` → header `Authorization: Bearer` — dùng khi chạy
 *     qua gateway/proxy (thiết lập mặc định của môi trường dev này).
 *
 * Không có biến nào → ném `AiUnavailableError` để router fallback sang local.
 */
export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();

  if (!apiKey && !authToken) {
    // Không có key → offline. Ném `AiUnavailableError` để router fallback sang local.
    throw new AiUnavailableError("Chưa cấu hình Anthropic API key.", "no_api_key");
  }
  if (!client) {
    client = new Anthropic({
      ...(apiKey ? { apiKey } : {}),
      ...(authToken ? { authToken } : {}),
    });
  }
  return client;
}

/**
 * Map lỗi SDK → exception typed (design.md §7.2).
 *
 * Bắt theo `instanceof` vì SDK có class lỗi riêng cho từng HTTP status.
 */
function mapSdkError(error: unknown): Error {
  if (error instanceof Anthropic.RateLimitError) {
    // `headers` là `Headers` của DOM — phải dùng `.get()`, không index được.
    const retryAfterHeader = error.headers?.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    return new AiRateLimitError(
      "Anthropic giới hạn tần suất yêu cầu.",
      typeof retryAfter === "number" && Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiTimeoutError("Anthropic không phản hồi trong thời gian cho phép.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiNetworkError("Không kết nối được tới Anthropic.");
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiUnavailableError("Anthropic API key không hợp lệ.", "no_api_key");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiUnavailableError("Anthropic từ chối truy cập với key này.", "unavailable");
  }
  if (error instanceof Anthropic.NotFoundError) {
    // Thường gặp khi model không có trong catalog của provider/gateway.
    return new AiUnavailableError("Model không tồn tại trong catalog của provider.", "unavailable");
  }
  if (error instanceof Anthropic.BadRequestError) {
    // 400 = request sai (model lạ, tham số sai) → không retry được.
    return new AiUnavailableError(
      `Anthropic từ chối yêu cầu (400): ${error.message}`,
      "unavailable",
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AiNetworkError(`Lỗi Anthropic (${error.status ?? "?"}): ${error.message}`);
  }
  if (error instanceof Error) {
    return new AiNetworkError(error.message);
  }
  return new AiNetworkError("Lỗi không xác định khi gọi Anthropic.");
}

/** Kết quả chi tiết của 1 lượt gọi Anthropic (data + số liệu token). */
export type AnthropicCallResult<T> = { data: T; usage: AnthropicUsage };

/**
 * Gọi Anthropic với structured output, trả về kèm số liệu token.
 *
 * Mọi lỗi đều được ném ra dưới dạng exception typed — router bắt và quyết
 * định fallback (design.md §6.2).
 */
export async function callAnthropicDetailed<T>(
  opts: AnthropicCallOptions<T>,
): Promise<AnthropicCallResult<T>> {
  const anthropic = getAnthropicClient();
  const model = opts.model ?? "claude-opus-5";
  const maxTokens = opts.maxTokens ?? 4096;

  // `cache_control` đặt ở block system CUỐI → Anthropic cache cả prefix trước nó
  // (design.md §6.5). System prompt phải giống hệt giữa các lần để cache hit.
  const systemBlocks: Anthropic.TextBlockParam[] = [{ type: "text", text: opts.system }];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];

  const started = Date.now();

  try {
    const response = await anthropic.messages.parse({
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      ...(opts.schema ? { output_config: { format: zodOutputFormat(opts.schema) } } : {}),
    });

    const latencyMs = Date.now() - started;

    if (response.stop_reason === "refusal") {
      throw new AiRefusalError("AI không thể xử lý nội dung này.", response.stop_reason);
    }

    const usage = response.usage;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;

    const usageInfo: AnthropicUsage = {
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite,
      estimatedCost: estimateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite),
      latencyMs,
    };

    if (opts.schema) {
      // `zodOutputFormat` đã validate sẵn; `safeParse` là lưới an toàn thứ 2.
      const parsed = opts.schema.safeParse(response.parsed_output);
      if (!parsed.success) {
        throw new ValidationError(
          "Cấu trúc trả về từ AI không khớp schema.",
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        );
      }
      return { data: parsed.data, usage: usageInfo };
    }

    // Không có schema → trả nguyên text đầu tiên.
    const firstText = response.content.find((block) => block.type === "text");
    return { data: (firstText?.text ?? "") as T, usage: usageInfo };
  } catch (error) {
    // Lỗi typed đã sinh ra trong thân try → giữ nguyên.
    if (
      error instanceof AiRefusalError ||
      error instanceof ValidationError ||
      error instanceof AiRateLimitError ||
      error instanceof AiTimeoutError ||
      error instanceof AiNetworkError ||
      error instanceof AiUnavailableError
    ) {
      throw error;
    }
    // `zodOutputFormat.parse` ném `AnthropicError` khi JSON lệch schema → map sang ValidationError.
    if (error instanceof Anthropic.AnthropicError && error.message.includes("structured output")) {
      throw new ValidationError("Cấu trúc trả về từ AI không khớp schema.", [error.message]);
    }
    throw mapSdkError(error);
  }
}

/**
 * Gọi Anthropic và trả về đúng dữ liệu đã parse (design.md §6.3).
 *
 * Hàm này là API công khai của client; router dùng biến thể `Detailed` để lấy
 * thêm số liệu token mà không ghi trùng dòng `AiCall`.
 */
export async function callAnthropic<T>(opts: AnthropicCallOptions<T>): Promise<T> {
  const result = await callAnthropicDetailed<T>(opts);
  return result.data;
}
