"use client";

import { Chip } from "./Chip";

/** Map a 0..10 rubric score to a difficulty tier. */
export function difficultyForRound(round: number, planned: number): "L3-Junior" | "L4-Mid" | "L5-Senior" | "Staff" {
  const ratio = round / planned;
  if (ratio <= 0.34) return "L3-Junior";
  if (ratio <= 0.67) return "L4-Mid";
  if (ratio <= 0.9) return "L5-Senior";
  return "Staff";
}

export function DifficultyBadge({ tier }: { tier: "L3-Junior" | "L4-Mid" | "L5-Senior" | "Staff" }) {
  const tone = tier === "Staff" || tier === "L5-Senior" ? "amber" : tier === "L3-Junior" ? "emerald" : "indigo";
  return <Chip tone={tone as "amber" | "emerald" | "indigo"}>{tier}</Chip>;
}
