"use client";

import { useCallback, useRef, useState } from "react";

import type { NextWeekPlan, WeeklyInsights } from "@/lib/weekly-review";

export interface WeeklyStreamState {
  insights: WeeklyInsights | null;
  plan: NextWeekPlan | null;
  warning: string | null;
  streaming: boolean;
  error: string | null;
}

export interface UseWeeklyInsightsResult extends WeeklyStreamState {
  start: (week: string) => Promise<void>;
  reset: () => void;
}

/**
 * Đọc stream NDJSON từ `POST /api/review/weekly`.
 *
 * ⚠️ Lỗi mạng giữa chừng ⇒ giữ chunk đã nhận, hiện banner lỗi + nút "Thử lại".
 * ⚠️ Không gọi API khi thiếu `ANTHROPIC_API_KEY`.
 */
export function useWeeklyInsights(hasApiKey: boolean): UseWeeklyInsightsResult {
  const [state, setState] = useState<WeeklyStreamState>({
    insights: null,
    plan: null,
    warning: null,
    streaming: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({
      insights: null,
      plan: null,
      warning: null,
      streaming: false,
      error: null,
    });
  }, []);

  const start = useCallback(
    async (week: string) => {
      if (!hasApiKey) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, streaming: true, error: null }));

      try {
        const res = await fetch("/api/review/weekly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          setState((prev) => ({
            ...prev,
            streaming: false,
            error: body.message ?? "AI đang tải cao. Thử lại sau vài phút.",
          }));
          return;
        }

        if (!res.body) {
          setState((prev) => ({
            ...prev,
            streaming: false,
            error: "Kết nối bị gián đoạn — nhận định có thể chưa đầy đủ.",
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            handleEvent(trimmed, setState);
          }
        }

        setState((prev) => ({ ...prev, streaming: false }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          streaming: false,
          error: "Kết nối bị gián đoạn — nhận định có thể chưa đầy đủ.",
        }));
      }
    },
    [hasApiKey],
  );

  return { ...state, start, reset };
}

interface StreamEvent {
  type: "insight" | "plan" | "done" | "error";
  insights?: WeeklyInsights;
  plan?: NextWeekPlan;
  warning?: string | null;
  code?: string;
  message?: string;
}

function handleEvent(
  line: string,
  setState: React.Dispatch<React.SetStateAction<WeeklyStreamState>>,
): void {
  let event: StreamEvent;
  try {
    event = JSON.parse(line) as StreamEvent;
  } catch {
    return;
  }

  switch (event.type) {
    case "insight":
      if (event.insights) {
        setState((prev) => ({ ...prev, insights: event.insights ?? null }));
      }
      return;
    case "plan":
      setState((prev) => ({
        ...prev,
        plan: event.plan ?? null,
        warning: event.warning ?? null,
      }));
      return;
    case "done":
      setState((prev) => ({
        ...prev,
        streaming: false,
        insights: event.insights ?? prev.insights,
        plan: event.plan ?? prev.plan,
        warning: event.warning ?? prev.warning,
      }));
      return;
    case "error":
      setState((prev) => ({
        ...prev,
        streaming: false,
        error: event.message ?? "AI không thể tổng hợp nội dung này.",
      }));
      return;
    default:
      return;
  }
}
