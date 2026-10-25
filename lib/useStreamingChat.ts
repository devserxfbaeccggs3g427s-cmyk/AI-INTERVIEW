"use client";

/**
 * Client hook that submits the candidate's answer and consumes the SSE
 * response stream from /api/sessions/[id]/messages.
 *
 * It does NOT log the API key; the key is held in React state and sent
 * only with a request header, then forgotten.
 */
import { useCallback, useRef, useState } from "react";
import type { ProviderId } from "@/components/ByokConfigContext";

export interface StreamHandlers {
  onStart?: (info: { turn: number; plan: { planned: number; completed: number }; mode: "strict" | "coaching" }) => void;
  onDelta?: (text: string) => void;
  onCoaching?: (rubric: { turn: number; score: number; strengths: string[]; improvements: string[] }) => void;
  onCoachingUnavailable?: (info: { turn: number; message: string }) => void;
  onPersisted?: (info: { userTurn: number; assistantTurn: number }) => void;
  onDone?: (info: { reason: "next" | "complete" | "evaluating"; sessionId: string }) => void;
}

export interface StreamError { message: string; status?: number }

export function useStreamingChat() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<StreamError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submit = useCallback(async (args: {
    sessionId: string;
    provider: ProviderId;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    answer: string;
    earlyStop?: boolean;
  }, handlers: StreamHandlers) => {
    setError(null);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/sessions/${args.sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(args.apiKey ? { "x-api-key": args.apiKey } : {}) },
        body: JSON.stringify({
          provider: args.provider,
          model: args.model,
          baseUrl: args.baseUrl,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          topP: args.topP,
          answer: args.answer,
          earlyStop: args.earlyStop,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); detail = j.error ?? j.detail ?? detail; } catch {}
        throw Object.assign(new Error(detail), { status: res.status });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      const readFrames = () => {
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            let evt: unknown;
            try { evt = JSON.parse(payload); } catch { continue; }
            if (!evt || typeof evt !== "object" || !("type" in evt)) continue;
            if (evt.type === "start") handlers.onStart?.(evt as unknown as Parameters<NonNullable<StreamHandlers["onStart"]>>[0]);
            else if (evt.type === "delta") handlers.onDelta?.((evt as unknown as { text: string }).text);
            else if (evt.type === "coaching") handlers.onCoaching?.(evt as unknown as Parameters<NonNullable<StreamHandlers["onCoaching"]>>[0]);
            else if (evt.type === "coaching_unavailable") handlers.onCoachingUnavailable?.(evt as unknown as { turn: number; message: string });
            else if (evt.type === "persisted") handlers.onPersisted?.(evt as unknown as Parameters<NonNullable<StreamHandlers["onPersisted"]>>[0]);
            else if (evt.type === "done") {
              finished = true;
              handlers.onDone?.(evt as unknown as Parameters<NonNullable<StreamHandlers["onDone"]>>[0]);
            } else if (evt.type === "error") throw new Error((evt as { message?: string }).message ?? "Không thể hoàn thành yêu cầu.");
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        readFrames();
      }
      buffer += decoder.decode().replace(/\r\n/g, "\n");
      if (buffer.trim()) {
        buffer += "\n\n";
        readFrames();
      }
      if (!finished) throw new Error("Kết nối bị ngắt trước khi tác vụ hoàn tất. Vui lòng kiểm tra trạng thái phiên.");
    } catch (e) {
      if (ctrl.signal.aborted) throw e;
      const err = e as Error & { status?: number };
      setError({ message: err.message, status: err.status });
      throw e;
    } finally {
      setStreaming(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  return { streaming, error, submit, stop };
}
