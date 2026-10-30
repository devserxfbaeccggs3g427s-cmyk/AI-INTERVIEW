/**
 * Client Ollama — provider local (FR-AI-02, FR-AI-13).
 *
 * Vì sao dùng HTTP thay vì SDK:
 *   - Ollama không có SDK chính thức cho JS; API chỉ có `/api/chat` + `/api/tags`.
 *   - Toàn bộ provider local chạy **offline** — không token, không chi phí (AC-15).
 *
 * Xem tasks.md 2.7 / 2.10 · design.md §6.4 / §6.9.
 */

import { z } from "zod";

import { AiNetworkError, AiTimeoutError, AiUnavailableError, ValidationError } from "@/lib/errors";

/** Base URL của Ollama — đọc từ env, mặc định theo design.md §6.4. */
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** Timeout mặc định cho 1 lượt suy luận (design.md §6.4). */
const CHAT_TIMEOUT_MS = 30_000;

/** Timeout cho việc dò Ollama — ngắn để UI không bị treo (design.md §6.4, §6.9). */
const TAGS_TIMEOUT_MS = 3_000;

/** Model local mặc định khi task không chỉ định. */
export const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL_DEFAULT ?? "qwen2.5:7b";

export type LocalCallOptions<T> = {
  /** Task id — dùng làm `AiCall.feature`. */
  task: string;
  /** System prompt — phải tĩnh để cache phía local (nếu Ollama có cache). */
  system: string;
  /** User message. */
  user: string;
  /** Schema structured output → chuyển thành JSON schema cho `format`. */
  schema?: z.ZodType<T>;
  /** Model ghi đè (mặc định lấy từ ROUTES của router). */
  model?: string;
  /** Nhiệt độ — 0 cho task phân loại để kết quả ổn định. */
  temperature?: number;
};

/** Kết quả dò Ollama — luôn có `available`, kể cả khi lỗi. */
export type LocalModelsResult = {
  available: boolean;
  models: Array<{ name: string; size: number }>;
  baseUrl: string;
};

/**
 * Gọi Ollama `/api/chat` với structured output.
 *
 * Body theo API Ollama: `{model, messages, stream:false, format:<json schema>}`.
 * `format` là JSON Schema → Ollama ép model trả về đúng cấu trúc (tương đương
 * structured output của Anthropic — design.md §6.6).
 *
 * Mọi lỗi → exception typed để router fallback (design.md §6.4).
 */
export async function callLocal<T>(opts: LocalCallOptions<T>): Promise<T> {
  const model = opts.model ?? OLLAMA_DEFAULT_MODEL;

  const messages = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  // Ollama nhận `format` là JSON Schema dạng object.
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0 },
  };
  if (opts.schema) {
    body.format = z.toJSONSchema(opts.schema, { io: "output" }) as Record<string, unknown>;
  }

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof AiTimeoutError) throw error;
    if (isTimeoutError(error)) {
      throw new AiTimeoutError(`Ollama không phản hồi trong ${CHAT_TIMEOUT_MS / 1000}s.`);
    }
    if (isConnectionRefused(error)) {
      throw new AiUnavailableError(
        "Không kết nối được Ollama — hãy bật Ollama hoặc cấu hình API key.",
        "ollama_down",
      );
    }
    throw new AiNetworkError(
      `Lỗi gọi Ollama: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiNetworkError(`Ollama trả về ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };

  const raw = payload.message?.content ?? payload.response ?? "";
  if (!raw) {
    throw new ValidationError("Ollama trả về nội dung rỗng.", ["response rỗng"]);
  }

  if (!opts.schema) {
    return raw as T;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ValidationError("Ollama trả về JSON không hợp lệ.", [raw.slice(0, 300)]);
  }

  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError(
      "Cấu trúc trả về từ Ollama không khớp schema.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return parsed.data;
}

/**
 * Dò Ollama có chạy không + lấy danh sách model (FR-AI-12).
 *
 * Timeout 3s — UI phải hiển thị trạng thái Offline nhanh (design.md §6.9).
 * Lỗi → `{available:false, models:[]}` — không ném, vì đây là hàm *truy vấn trạng thái*.
 */
export async function listLocalModels(): Promise<LocalModelsResult> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(TAGS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { available: false, models: [], baseUrl: OLLAMA_BASE_URL };
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; model?: string; size?: number }>;
    };
    const models = (payload.models ?? [])
      .map((m) => ({ name: m.name ?? m.model ?? "", size: m.size ?? 0 }))
      .filter((m) => m.name !== "");
    return { available: true, models, baseUrl: OLLAMA_BASE_URL };
  } catch {
    return { available: false, models: [], baseUrl: OLLAMA_BASE_URL };
  }
}

/** Ollama có đang chạy không (bọc `listLocalModels` cho call-site gọn). */
export async function isOllamaAvailable(): Promise<boolean> {
  const result = await listLocalModels();
  return result.available;
}

/** `fetch` bị timeout (AbortError) — Node đặt tên lỗi là `TimeoutError`. */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}

/** Kết nối bị từ chối → Ollama không chạy. */
function isConnectionRefused(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? "";
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    error.message.includes("ECONNREFUSED")
  );
}
