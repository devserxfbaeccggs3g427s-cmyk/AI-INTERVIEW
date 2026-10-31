"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PlanSlotDTO } from "@/lib/daily-loop";

/**
 * Hook đọc stream SSE của `POST /api/plan/generate` (task §26).
 *
 * Tách riêng khỏi `plan-workspace.tsx` để:
 *  1. test được phần parse SSE mà không cần DOM;
 *  2. `plan-workspace.tsx` chỉ lo render + tương tác.
 *
 * ⚠️ Slot `done` là bất biến — stream **không** được ghi đè nội dung slot đã
 * xong. Đây là bất biến nghiệp vụ (FR-DL-05), không phải chi tiết UI.
 */

export type StreamState = "idle" | "streaming" | "done" | "error";

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  /** Token input đọc từ cache (prompt caching — AC-DL-10). */
  cacheRead: number;
  /** Token input ghi vào cache. */
  cacheWrite: number;
  /** Độ trễ ms. */
  latencyMs: number;
  /** Chi phí USD ước tính. */
  estimatedCost: number;
}

export interface PlanStreamEvent {
  type: "slot" | "usage" | "done" | "error";
  slot?: PlanSlotDTO;
  items?: PlanSlotDTO[];
  keptDone?: number;
  source?: "ai" | "fallback";
  usage?: StreamUsage;
  code?: string;
  message?: string;
}

export type GenerateMode = "generate" | "regenerate" | "fallback";

export interface UsePlanStreamOptions {
  /** Ngày (yyyy-MM-dd). */
  date: string;
  /** Kế hoạch ban đầu từ server. */
  initialItems: PlanSlotDTO[];
  /** false ⇒ không có API key, dùng bộ sinh offline. */
  aiAvailable: boolean;
}

export interface UsePlanStreamResult {
  items: PlanSlotDTO[];
  setItems: React.Dispatch<React.SetStateAction<PlanSlotDTO[]>>;
  streamState: StreamState;
  error: string | null;
  setError: (message: string | null) => void;
  usage: StreamUsage | null;
  source: "ai" | "fallback" | "mixed";
  generate: (mode: GenerateMode) => Promise<void>;
  /** Dừng stream đang chạy (đổi ngày / unmount). */
  abort: () => void;
}

/**
 * Parse 1 khối SSE thành event.
 *
 * ⚠️ Tách ra hàm thuần để test được không cần network.
 */
export function parseSseChunk(chunk: string): PlanStreamEvent[] {
  const events: PlanStreamEvent[] = [];

  for (const part of chunk.split("\n\n")) {
    const dataLine = part.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;

    try {
      events.push(JSON.parse(dataLine.slice(6)) as PlanStreamEvent);
    } catch {
      // Chunk chưa đầy đủ hoặc JSON hỏng — bỏ qua, không làm sập stream.
    }
  }

  return events;
}

/**
 * Gộp 1 slot mới vào danh sách hiện tại, **tôn trọng bất biến slot `done`**.
 */
export function mergeStreamedSlot(
  current: PlanSlotDTO[],
  incoming: PlanSlotDTO,
): PlanSlotDTO[] {
  const index = current.findIndex((item) => item.slot === incoming.slot);

  if (index === -1) {
    return [...current, incoming].sort((a, b) => a.slot - b.slot);
  }

  // Slot đã xong là bất biến — không cho stream ghi đè.
  if (current[index].done) return current;

  const next = [...current];
  next[index] = { ...next[index], ...incoming, done: false };
  return next;
}

export function usePlanStream({
  date,
  initialItems,
  aiAvailable,
}: UsePlanStreamOptions): UsePlanStreamResult {
  const [items, setItems] = useState<PlanSlotDTO[]>(initialItems);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<StreamUsage | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | "mixed">("mixed");
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const generate = useCallback(
    async (mode: GenerateMode) => {
      setError(null);
      setStreamState("streaming");
      setUsage(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, mode, keepDone: true }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStreamState("error");
          setError("Không kết nối được máy chủ sinh kế hoạch.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE: mỗi event là 1 dòng `data: {...}` + dòng trống.
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const event of parseSseChunk(parts.join("\n\n"))) {
            if (event.type === "slot" && event.slot) {
              const incoming = event.slot;
              setItems((current) => mergeStreamedSlot(current, incoming));
            } else if (event.type === "usage" && event.usage) {
              setUsage(event.usage);
            } else if (event.type === "done") {
              if (event.items) {
                setItems(event.items);
                setSource(event.source ?? "ai");
              }
              setStreamState("done");
            } else if (event.type === "error") {
              setStreamState("error");
              setError(event.message ?? "Không sinh được kế hoạch.");
            }
          }
        }

        setStreamState((current) => (current === "streaming" ? "done" : current));
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setStreamState("error");
        setError("Kết nối bị ngắt giữa chừng — bản nháp của bạn vẫn còn nguyên.");
      }
    },
    [date],
  );

  // Tự sinh kế hoạch khi mở S02 mà chưa có kế hoạch nào.
  useEffect(() => {
    if (initialItems.length === 0 && streamState === "idle") {
      void generate(aiAvailable ? "generate" : "fallback");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dừng stream khi component unmount (đổi ngày / rời trang).
  useEffect(() => abort, [abort]);

  return {
    items,
    setItems,
    streamState,
    error,
    setError,
    usage,
    source,
    generate,
    abort,
  };
}
