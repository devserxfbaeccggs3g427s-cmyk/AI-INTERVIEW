/**
 * Per-provider BYOK preferences + the guards around switching providers and
 * writing models.
 *
 * Kept framework-free (no React, no browser globals) so `lib/byok-prefs.test.ts`
 * can table-drive every invariant without a DOM, matching the `lib/scoring.ts`
 * pattern. `components/ByokConfigContext.tsx` is the only consumer and holds
 * the storage/React wiring.
 *
 * Three defects this exists to fix:
 *  1. Switching provider used to keep the previous provider's apiKey, so a key
 *     could be sent to the wrong vendor. `switchProvider` now clears it.
 *  2. Each provider's model/temperature/topP/maxTokens was lost on switch, so
 *     A -> B -> A reset A back to registry defaults. They now live in
 *     `prefsByProvider` and survive the round trip.
 *  3. An in-flight fetchModels response could clobber a model the user typed by
 *     hand while it was loading. `applyFetchedModels` refuses to write once
 *     `manualModelEdit` is set.
 */

import {
  ENABLED_PROVIDER_IDS,
  isProviderId,
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  type ProviderId,
} from "./providers/registry";

/** The tunables that are remembered per provider. */
export interface ProviderPrefs {
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}

/** The full persisted shape (storage key `byok.config`). */
export interface ByokPrefs {
  version: 2;
  sessionOnly: boolean;
  /** Active provider. */
  provider: ProviderId;
  /** Active provider's key ONLY — cleared on switch. */
  apiKey: string;
  prefsByProvider: Partial<Record<ProviderId, ProviderPrefs>>;
  /** Set when the user typed a model by hand; blocks in-flight fetchModels writes. */
  manualModelEdit: boolean;
  /** Monotonic marker bumped on every manual model edit; stale fetches compare against it. */
  manualEditSeq: number;
}

/** Registry-preferred provider, else the first enabled one, else the first registry entry. */
const registryDefaultProvider: ProviderId =
  ENABLED_PROVIDER_IDS.find((id) => PROVIDER_REGISTRY[id].preferred) ??
  ENABLED_PROVIDER_IDS[0] ??
  PROVIDER_IDS[0];

/** Coerce a persisted number, falling back when it is absent or non-finite. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Coerce a persisted string, falling back when it is absent or not a string. */
function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * The stock preferences for a provider: its first registry model, no base URL,
 * and the house sampling defaults. Unknown providers degrade to the registry
 * default provider rather than throwing.
 */
export function defaultPrefsFor(provider: ProviderId): ProviderPrefs {
  const id = isProviderId(provider) ? provider : registryDefaultProvider;
  return {
    model: PROVIDER_REGISTRY[id].models[0].id,
    baseUrl: "",
    temperature: 0.4,
    maxTokens: 4096,
    topP: 0.95,
  };
}

/** The cold-start state: registry default provider, defaults, no key. */
export function defaultPrefs(): ByokPrefs {
  const provider = registryDefaultProvider;
  const prefs = defaultPrefsFor(provider);
  return {
    version: 2,
    sessionOnly: true,
    provider,
    apiKey: "",
    prefsByProvider: { [provider]: prefs },
    manualModelEdit: false,
    manualEditSeq: 0,
  };
}

/** Promote one provider's stored prefs to the active slot, writing it back so reads are symmetric. */
function withActive(state: ByokPrefs, provider: ProviderId, prefs: ProviderPrefs): ByokPrefs {
  return {
    ...state,
    provider,
    prefsByProvider: { ...state.prefsByProvider, [provider]: prefs },
  };
}

/** Read the active provider's prefs, falling back to that provider's defaults. */
export function activePrefs(state: ByokPrefs): ProviderPrefs {
  return state.prefsByProvider[state.provider] ?? defaultPrefsFor(state.provider);
}

/**
 * Parse a persisted payload into a v2 state, accepting both the v1 flat shape
 * and the v2 shape. Returns null for anything unusable (non-object, missing or
 * unknown provider) so the caller can fall back to `defaultPrefs()`.
 *
 * v1 rule: the flat model/baseUrl/temperature/maxTokens/topP are lifted into
 * `prefsByProvider[provider]`; sessionOnly and apiKey carry across; the manual
 * flags start clean (a persisted v1 value cannot have a hand-typed model we
 * know about). A v1 provider that is not a known ProviderId falls back to the
 * registry default and its prefs are DROPPED rather than persisted under an
 * unknown key. Any non-finite number falls back to the default for that field.
 */
export function migrate(raw: unknown): ByokPrefs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // v2 already has the map; v1 has flat fields and (usually) no version tag.
  const isV2 = obj.version === 2 && obj.prefsByProvider !== undefined;
  const requested = obj.provider;
  // A payload with no provider at all is unusable — the caller must fall back
  // to defaults rather than guess. An *unknown* provider string is different:
  // fall back to the registry default and drop its prefs (see below).
  if (requested === undefined || requested === null) return null;
  const providerKnown = isProviderId(requested);
  const provider = providerKnown ? requested : registryDefaultProvider;
  const sessionOnly = typeof obj.sessionOnly === "boolean" ? obj.sessionOnly : true;
  const apiKey = strOr(obj.apiKey, "");

  let prefsByProvider: Partial<Record<ProviderId, ProviderPrefs>>;
  let manualModelEdit = false;
  let manualEditSeq = 0;

  if (isV2) {
    const source = obj.prefsByProvider;
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    prefsByProvider = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (!isProviderId(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const p = value as Record<string, unknown>;
      const d = defaultPrefsFor(key);
      prefsByProvider[key] = {
        model: strOr(p.model, d.model),
        baseUrl: strOr(p.baseUrl, d.baseUrl),
        temperature: numOr(p.temperature, d.temperature),
        maxTokens: numOr(p.maxTokens, d.maxTokens),
        topP: numOr(p.topP, d.topP),
      };
    }
    manualModelEdit = obj.manualModelEdit === true;
    manualEditSeq = numOr(obj.manualEditSeq, 0);
  } else {
    // v1 flat shape. Lift its fields under the provider — unless that provider
    // was unknown, in which case its prefs are DROPPED and the fallback
    // provider starts from stock defaults.
    const d = defaultPrefsFor(provider);
    prefsByProvider = {
      [provider]: providerKnown
        ? {
            model: strOr(obj.model, d.model),
            baseUrl: strOr(obj.baseUrl, d.baseUrl),
            temperature: numOr(obj.temperature, d.temperature),
            maxTokens: numOr(obj.maxTokens, d.maxTokens),
            topP: numOr(obj.topP, d.topP),
          }
        : d,
    };
    manualModelEdit = false;
    manualEditSeq = 0;
  }

  // The active slot always has an entry so a later read is symmetric.
  if (!prefsByProvider[provider]) prefsByProvider[provider] = defaultPrefsFor(provider);

  return {
    version: 2,
    sessionOnly,
    provider,
    apiKey,
    prefsByProvider,
    manualModelEdit,
    manualEditSeq,
  };
}

/**
 * Switch the active provider. Clears apiKey so a key can never leak to the new
 * vendor, and promotes that provider's stored prefs (or its defaults) into the
 * active slot, writing them back so the map stays symmetric. Resets
 * manualModelEdit and bumps manualEditSeq so any fetch in flight is stale.
 *
 * Switching to the provider that is already active is a no-op: the key and
 * model are left exactly as they are.
 */
export function switchProvider(state: ByokPrefs, next: ProviderId): ByokPrefs {
  if (!isProviderId(next) || next === state.provider) return state;
  const promoted = state.prefsByProvider[next] ?? defaultPrefsFor(next);
  return {
    ...withActive(state, next, { ...promoted }),
    apiKey: "",
    manualModelEdit: false,
    manualEditSeq: state.manualEditSeq + 1,
  };
}

/**
 * Merge a patch into the active provider's prefs AND back into
 * prefsByProvider[active], so switching away and back preserves it. A patch
 * carrying `model` is treated as a hand edit: sets manualModelEdit true and
 * bumps manualEditSeq, which blocks in-flight fetchModels writes.
 */
export function setActivePrefs(state: ByokPrefs, patch: Partial<ProviderPrefs>): ByokPrefs {
  const current = activePrefs(state);
  const merged: ProviderPrefs = {
    ...current,
    ...patch,
  };
  const manual = patch.model !== undefined;
  return {
    ...withActive(state, state.provider, merged),
    manualModelEdit: manual ? true : state.manualModelEdit,
    manualEditSeq: manual ? state.manualEditSeq + 1 : state.manualEditSeq,
  };
}

/**
 * Apply a fetched model list. If manualModelEdit is true, return the state
 * UNCHANGED (the stale-fetch guard). Otherwise, if models is non-empty and does
 * not already contain the active model, set the active model to models[0]
 * through the same write-back path as setActivePrefs but WITHOUT setting
 * manualModelEdit.
 */
export function applyFetchedModels(state: ByokPrefs, models: string[]): ByokPrefs {
  if (state.manualModelEdit) return state;
  if (!Array.isArray(models) || models.length === 0) return state;
  const current = activePrefs(state);
  if (models.includes(current.model)) return state;
  // Same write-back path as setActivePrefs, but deliberately not through it:
  // a fetched model is not a hand edit, so manualModelEdit/seq must not move.
  return withActive(state, state.provider, { ...current, model: models[0] });
}

/** Serialize a state to the string persisted under `byok.config`. */
export function serialize(state: ByokPrefs): string {
  return JSON.stringify(state);
}

/** Parse a persisted string; delegates to `migrate` and returns null for garbage. */
export function deserialize(text: string): ByokPrefs | null {
  if (typeof text !== "string" || !text) return null;
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}