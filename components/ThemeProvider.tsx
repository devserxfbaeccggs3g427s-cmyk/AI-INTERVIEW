"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { parseThemePreference, resolveTheme, THEME_KEY, type ThemePreference } from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try { return parseThemePreference(localStorage.getItem(THEME_KEY)); }
  catch { return "system"; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferenceState(readPreference());
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setPreferenceState(readPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolveTheme(preference, media.matches);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.classList.toggle("light", resolved === "light");
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    if (preference === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [preference, hydrated]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch { /* Storage can be disabled; the choice still works in this tab. */ }
  }, []);

  return <ThemeContext.Provider value={{ preference, hydrated, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within <ThemeProvider>");
  return context;
}
