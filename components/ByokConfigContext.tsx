"use client";

/**
 * BYOK config is held client-side only:
 *  - sessionStorage when "session-only" is enabled (default; FR-13 / NFR-2)
 *  - localStorage when user opts in (with explicit NFR-2 warning)
 *
 * The server NEVER receives the persisted form — it gets the key in each
 * request header and discards it after the response (NFR-2 / NFR-10).
 *
 * Storage shape is v2 (`lib/byok-prefs.ts`): tunables live in
 * `prefsByProvider` so switching providers no longer resets the provider you
 * left, and `apiKey` holds the ACTIVE provider's key only. This file is a
 * thin React/storage wrapper around those pure helpers; all the invariants
 * (key clearing on switch, the stale-fetch guard, migration) live and are
 * tested in `lib/byok-prefs.ts`.
 */
import { useEffect, useState, useCallback, createContext, useContext, useMemo, type ReactNode } from "react";
import { detectProviderFromKey, isProviderEnabled, isProviderId, type ProviderId } from "@/lib/providers/registry";
import {
  activePrefs,
  applyFetchedModels as applyFetchedModelsPure,
  defaultPrefs,
  defaultPrefsFor,
  deserialize,
  serialize,
  setActivePrefs,
  switchProvider,
  type ByokPrefs,
  type ProviderPrefs,
} from "@/lib/byok-prefs";

export type { ProviderId } from "@/lib/providers/registry";

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

/** Cold start: registry-preferred provider, stock prefs, no key, session-only. */
const DEFAULT: ByokPrefs = defaultPrefs();
const KEY = "byok.config";

interface Ctx {
  cfg: ByokConfig;
  /**
   * Generic patch. Semantics that callers depend on:
   *  - `{ provider: X }` is equivalent to `selectProvider(X)`: the key is
   *    cleared, X's saved prefs are promoted, manualModelEdit resets.
   *  - `{ model: "..." }` is treated as a MANUAL edit (it flags
   *    manualModelEdit and bumps manualEditSeq) because pages drive it from a
   *    <select>/typing. Programmatic model writes must use
   *    `applyFetchedModels` instead.
   *  - `{ apiKey }` sets the active provider's key verbatim.
   */
  setCfg: (next: Partial<ByokConfig>) => void;
  reset: () => void;
  hydrated: boolean;
  /**
   * Switch the active provider: clears apiKey, promotes that provider's saved
   * prefs, resets manualModelEdit and bumps manualEditSeq. Selecting the
   * provider that is already active is a no-op — the apiKey, the model and
   * manualEditSeq are all left untouched, so re-clicking the active card
   * cannot sign the user out of their own provider.
   */
  selectProvider: (next: ProviderId) => void;
  /**
   * The ONLY sanctioned way to write a model that did not come from a user
   * keystroke (e.g. an in-flight `/api/models` response). No-ops entirely while
   * manualModelEdit is true, so a late response cannot clobber a hand-typed
   * model.
   */
  applyFetchedModels: (models: string[]) => void;
}

const ByokCtx = createContext<Ctx | null>(null);

export function ByokProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ByokPrefs>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
      if (raw) {
        // Handles both the v1 flat shape and v2; null means unusable.
        const parsed = deserialize(raw);
        if (parsed) {
          const providerUsable = isProviderId(parsed.provider) && isProviderEnabled(parsed.provider);
          const provider = providerUsable ? parsed.provider : DEFAULT.provider;
          // A stored provider that is no longer enabled falls back to the
          // default provider's prefs, but its own prefs stay in the map so
          // re-enabling it restores what the user had.
          const prefs = providerUsable ? activePrefs(parsed) : defaultPrefsFor(provider);
          setState({ ...parsed, provider, prefsByProvider: { ...parsed.prefsByProvider, [provider]: prefs } });
        }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: ByokPrefs) => {
    try {
      const storage = next.sessionOnly ? sessionStorage : localStorage;
      const other = next.sessionOnly ? localStorage : sessionStorage;
      storage.setItem(KEY, serialize(next));
      other.removeItem(KEY);
    } catch { /* ignore */ }
  }, []);

  const commit = useCallback((reduce: (prev: ByokPrefs) => ByokPrefs) => {
    setState((prev) => {
      const next = reduce(prev);
      if (next !== prev) persist(next);
      return next;
    });
  }, [persist]);

  const setCfg = useCallback((next: Partial<ByokConfig>) => {
    commit((prev) => {
      let state = prev;
      // A provider change is a switch first, so restored prefs survive and the
      // old key is dropped before any other field is applied.
      if (next.provider !== undefined && next.provider !== prev.provider) {
        state = switchProvider(state, next.provider);
      }
      const prefsPatch: Partial<ProviderPrefs> = {};
      if (next.model !== undefined) prefsPatch.model = next.model;
      if (next.baseUrl !== undefined) prefsPatch.baseUrl = next.baseUrl;
      if (next.temperature !== undefined) prefsPatch.temperature = next.temperature;
      if (next.maxTokens !== undefined) prefsPatch.maxTokens = next.maxTokens;
      if (next.topP !== undefined) prefsPatch.topP = next.topP;
      if (Object.keys(prefsPatch).length > 0) {
        // A `model` in this patch is a manual edit by definition.
        state = setActivePrefs(state, prefsPatch);
      }
      if (next.apiKey !== undefined) state = { ...state, apiKey: next.apiKey };
      if (next.sessionOnly !== undefined) state = { ...state, sessionOnly: next.sessionOnly };
      return state;
    });
  }, [commit]);

  const selectProvider = useCallback((next: ProviderId) => {
    // switchProvider is a no-op when `next` is already active.
    commit((prev) => switchProvider(prev, next));
  }, [commit]);

  const applyFetchedModels = useCallback((models: string[]) => {
    commit((prev) => applyFetchedModelsPure(prev, models));
  }, [commit]);

  const reset = useCallback(() => {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* ignore */ }
    setState(DEFAULT);
  }, []);

  // Consumers read the active provider's prefs through the flat fields, so the
  // value handed out is the active slot flattened onto provider/apiKey/sessionOnly.
  const cfg = useMemo<ByokConfig>(() => {
    const prefs = activePrefs(state);
    return {
      provider: state.provider,
      apiKey: state.apiKey,
      sessionOnly: state.sessionOnly,
      model: prefs.model,
      baseUrl: prefs.baseUrl,
      temperature: prefs.temperature,
      maxTokens: prefs.maxTokens,
      topP: prefs.topP,
    };
  }, [state]);

  const value = useMemo<Ctx>(
    () => ({ cfg, setCfg, reset, hydrated, selectProvider, applyFetchedModels }),
    [cfg, setCfg, reset, hydrated, selectProvider, applyFetchedModels],
  );

  return <ByokCtx.Provider value={value}>{children}</ByokCtx.Provider>;
}

export function useByok() {
  const ctx = useContext(ByokCtx);
  if (!ctx) throw new Error("useByok must be used within <ByokProvider>");
  return ctx;
}

export function detectedProviderFromKey(key: string): ProviderId | null {
  return detectProviderFromKey(key);
}