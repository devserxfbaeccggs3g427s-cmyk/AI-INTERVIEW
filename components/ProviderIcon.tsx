"use client";

import { isProviderId, PROVIDER_REGISTRY } from "@/lib/providers/registry";

export function ProviderIcon({ provider, className = "" }: { provider: string; className?: string }) {
  const icon = isProviderId(provider) ? PROVIDER_REGISTRY[provider].icon : "memory";
  return <span className={`material-symbols-outlined ${className}`}>{icon}</span>;
}
