"use client";
import type { ReactNode } from "react";

type ChipTone = "neutral" | "emerald" | "amber" | "indigo" | "rose";

export function Chip({
  tone = "neutral",
  children,
  dot = true,
  className = "",
}: {
  tone?: ChipTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`chip chip-${tone} ${className}`}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}
