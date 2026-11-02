import { describe, expect, it } from "vitest";

// Set DATABASE_URL before importing @/lib/db (Prisma reads env at import time).
process.env.DATABASE_URL = "file:./dev.db";

import { prisma } from "@/lib/db";

/**
 * FR-AF-19 — Prisma client singleton (tránh tạo nhiều connection khi hot-reload).
 * FR-AF-18 — Schema đúng 15 model (SPEC §4).
 */
describe("FR-AF-19 — db.ts singleton Prisma", () => {
  it("prisma là singleton (cùng instance khi import nhiều lần)", async () => {
    const { prisma: p1 } = await import("@/lib/db");
    const { prisma: p2 } = await import("@/lib/db");
    expect(p1).toBe(p2);
  });

  it("prisma instance có thể query (DB đã migrate + seed)", async () => {
    const skills = await prisma.skill.findMany({ select: { id: true } });
    expect(skills.length).toBeGreaterThan(0);

    const cards = await prisma.card.findMany({ select: { id: true } });
    expect(cards.length).toBeGreaterThan(0);
  });
});