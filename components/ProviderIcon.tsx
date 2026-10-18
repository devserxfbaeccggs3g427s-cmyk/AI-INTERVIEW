"use client";

const ICON: Record<string, string> = {
  anthropic: "terminal",
  openai: "psychology",
  gemini: "diamond",
  custom: "hub",
};

export function ProviderIcon({ provider, className = "" }: { provider: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{ICON[provider] ?? "memory"}</span>;
}
