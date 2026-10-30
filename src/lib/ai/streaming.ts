/**
 * Helper streaming SSE — đọc `ReadableStream` → phát event `token` / `done`.
 *
 * Chỉ dùng cho provider `anthropic` (design.md §6.7): Ollama local không
 * streaming trong thiết kế này, nên route handler phải tự chọn provider.
 *
 * Route handler dùng:
 * ```ts
 * const stream = await streamAnthropic({ task, system, user });
 * return new Response(toSseResponse(stream), { headers: SSE_HEADERS });
 * ```
 *
 * Xem tasks.md 2.8 · design.md §6.7.
 */

import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { AiNetworkError, AiTimeoutError } from "@/lib/errors";

/** Event SSE mà client sẽ nhận. */
export type AiStreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

/** Header chuẩn của response SSE. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export type StreamAnthropicOptions = {
  /** Task id — dùng làm `AiCall.feature` khi route handler ghi log. */
  task: string;
  /** System prompt — phải tĩnh để cache hit. */
  system: string;
  /** User message. */
  user: string;
  /** Model ghi đè (mặc định `claude-opus-5`). */
  model?: string;
  /** Giới hạn token đầu ra. */
  maxTokens?: number;
};

/**
 * Mở stream token từ Anthropic.
 *
 * Trả về async iterator theo chuẩn `AsyncIterable` — route handler chuyển nó
 * thành SSE bằng `toSseResponse`.
 */
export async function streamAnthropic(
  opts: StreamAnthropicOptions,
): Promise<AsyncIterable<AiStreamEvent>> {
  const anthropic: Anthropic = getAnthropicClient();
  const model = opts.model ?? "claude-opus-5";
  const maxTokens = opts.maxTokens ?? 4096;

  // `cache_control` ở block system cuối → cache prefix (design.md §6.5).
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: opts.system }];

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: opts.user }],
  });

  async function* iterate(): AsyncGenerator<AiStreamEvent> {
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta" && delta.text) {
            yield { type: "token", text: delta.text };
          }
        }
        if (event.type === "message_stop") {
          yield { type: "done", stopReason: null };
          return;
        }
      }
      yield { type: "done", stopReason: null };
    } catch (error) {
      if (error instanceof AiTimeoutError) throw error;
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "Lỗi khi đọc stream từ AI.",
      };
    }
  }

  return iterate();
}

/**
 * Chuyển async iterator event → `ReadableStream` SSE.
 *
 * Mỗi event được ghi theo chuẩn SSE: `data: {json}\n\n`. Client dùng
 * `EventSource` hoặc `fetch` + `ReadableStream` (design.md §6.7).
 */
export function toSseResponse(events: AsyncIterable<AiStreamEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === "done") break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lỗi stream AI.";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Đọc `ReadableStream` (byte) → tách từng event SSE.
 *
 * Dùng khi muốn chuyển stream của Anthropic sang dạng text thuần (ví dụ để
 * gom trong 1 lần gọi không cần streaming tới client).
 */
export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
): Promise<AsyncGenerator<AiStreamEvent>> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";

  async function* iterate(): AsyncGenerator<AiStreamEvent> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE tách event bằng `\n\n`.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseSseChunk(chunk);
          if (parsed) yield parsed;
          sep = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      throw error instanceof AiNetworkError
        ? error
        : new AiNetworkError(error instanceof Error ? error.message : "Lỗi đọc SSE.");
    }
  }

  return iterate();
}

/** Parse 1 khối SSE → event, hoặc `null` nếu không phải event `data:`. */
function parseSseChunk(chunk: string): AiStreamEvent | null {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return null;

  const payload = dataLine.slice("data:".length).trim();
  if (payload === "") return null;

  try {
    return JSON.parse(payload) as AiStreamEvent;
  } catch {
    return { type: "error", message: "Không đọc được event SSE." };
  }
}
