"use client";

/**
 * BYOK config is held client-side only:
 *  - sessionStorage when "session-only" is enabled (default; FR-13 / NFR-2)
 *  - localStorage when user opts in (with explicit NFR-2 warning)
 *
 * The server NEVER receives the persisted form — it gets the key in each
 * request body and discards it after the response (NFR-2 / NFR-10).
 */
import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { detectKeyProvider } from "@/lib/types-shared";

export type ProviderId = "anthropic" | "openai" | "gemini" | "custom";

export interface ByokConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  sessionOnly: boolean;
}

const DEFAULT: ByokConfig = {
  provider: "openai",
  model: "gpt-4o",
  baseUrl: "",
  apiKey: "",
  temperature: 0.4,
  maxTokens: 4096,
  topP: 0.95,
  sessionOnly: true,
};

const KEY = "byok.config";

interface Ctx {
  cfg: ByokConfig;
  setCfg: (next: Partial<ByokConfig>) => void;
  reset: () => void;
  hydrated: boolean;
}

const ByokCtx = createContext<Ctx | null>(null);

export function ByokProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfgState] = useState<ByokConfig>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ByokConfig;
        if (parsed && typeof parsed === "object") setCfgState({ ...DEFAULT, ...parsed });
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: ByokConfig) => {
    try {
      const storage = next.sessionOnly ? sessionStorage : localStorage;
      const other = next.sessionOnly ? localStorage : sessionStorage;
      storage.setItem(KEY, JSON.stringify(next));
      other.removeItem(KEY);
    } catch { /* ignore */ }
  }, []);

  const setCfg = useCallback((next: Partial<ByokConfig>) => {
    setCfgState((prev) => {
      const merged = { ...prev, ...next };
      persist(merged);
      return merged;
    });
  }, [persist]);

  const reset = useCallback(() => {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
    setCfgState(DEFAULT);
  }, []);

  return <ByokCtx.Provider value={{ cfg, setCfg, reset, hydrated }}>{children}</ByokCtx.Provider>;
}

export function useByok() {
  const ctx = useContext(ByokCtx);
  if (!ctx) throw new Error("useByok must be used within <ByokProvider>");
  return ctx;
}

export function detectedProviderFromKey(key: string): ProviderId | null {
  return detectKeyProvider(key);
}
