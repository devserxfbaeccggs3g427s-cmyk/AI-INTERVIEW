import { describe, expect, it } from "vitest";

import { SKILL_TREE, FOCUS_SKILL_IDS } from "../prisma/seed-data/skills";
import { CARDS } from "../prisma/seed-data/cards";

/**
 * FR-AF-23 — Seed tĩnh: user profile + cây kỹ năng Java (53 node) + 140 thẻ zh/en.
 * NFR-AF-07 — Determinism: npm run db:reset cho ra DB giống hệt nhau (seed idempotent).
 * AC-AF-7 — 53 skill · 140 thẻ (70 zh + 70 en) · 1 profile; chạy lại seed cho kết quả GIỐNG HẸT.
 */
describe("FR-AF-23 + NFR-AF-07 — seed dữ liệu tĩnh & idempotent", () => {
  it("cây kỹ năng có đúng 53 node", () => {
    expect(SKILL_TREE).toHaveLength(53);
  });

  it("id không trùng lặp", () => {
    const ids = SKILL_TREE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("đúng 4 node domain-root, parentId = null", () => {
    const roots = SKILL_TREE.filter((s) => s.parentId === null);
    expect(roots).toHaveLength(4);
    expect(roots.map((r) => r.domain).sort()).toEqual([
      "communication",
      "language",
      "personal",
      "professional",
    ]);
  });

  it("chỉ dùng 4 domain đóng băng (P5)", () => {
    const domains = new Set(SKILL_TREE.map((s) => s.domain));
    expect([...domains].sort()).toEqual([
      "communication",
      "language",
      "personal",
      "professional",
    ]);
  });

  it("mọi parentId đều tồn tại trong cây", () => {
    const ids = new Set(SKILL_TREE.map((s) => s.id));
    for (const skill of SKILL_TREE) {
      if (skill.parentId) {
        expect(ids.has(skill.parentId)).toBe(true);
      }
    }
  });

  it("cây đúng 3 tầng: 4 domain + 16 tầng 2 + 33 tầng 3", () => {
    expect(SKILL_TREE.filter((s) => s.depth === 1)).toHaveLength(4);
    expect(SKILL_TREE.filter((s) => s.depth === 2)).toHaveLength(16);
    expect(SKILL_TREE.filter((s) => s.depth === 3)).toHaveLength(33);
  });

  it("mọi node tầng 3 có parentId không null", () => {
    for (const skill of SKILL_TREE.filter((s) => s.depth === 3)) {
      expect(skill.parentId).not.toBeNull();
    }
  });

  it("mọi node tầng 2 trỏ về 1 node domain", () => {
    const roots = new Set(SKILL_TREE.filter((s) => s.depth === 1).map((s) => s.id));
    for (const skill of SKILL_TREE.filter((s) => s.depth === 2)) {
      expect(skill.parentId).not.toBeNull();
      expect(roots.has(skill.parentId as string)).toBe(true);
    }
  });

  it("có đúng 2 node trọng tâm (Q6)", () => {
    expect(FOCUS_SKILL_IDS).toHaveLength(2);
    expect(FOCUS_SKILL_IDS).toContain("skill-sd-requirements");
    expect(FOCUS_SKILL_IDS).toContain("skill-sd-tradeoff");
  });

  it("node Tiếng Việt nằm trong domain language (Q2)", () => {
    const vi = SKILL_TREE.find((s) => s.id === "skill-lang-vi");
    expect(vi).toBeDefined();
    expect(vi?.domain).toBe("language");
  });

  it("targetLevel: domain/tầng 2 = 3, tầng 3 = 4", () => {
    for (const skill of SKILL_TREE) {
      expect(skill.targetLevel).toBe(skill.depth === 3 ? 4 : 3);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Thẻ ngoại ngữ
  // ──────────────────────────────────────────────────────────────────────

  it("có đúng 140 thẻ", () => {
    expect(CARDS).toHaveLength(140);
  });

  it("70 zh + 70 en", () => {
    expect(CARDS.filter((c) => c.lang === "zh")).toHaveLength(70);
    expect(CARDS.filter((c) => c.lang === "en")).toHaveLength(70);
  });

  it("id không trùng lặp", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mỗi ngôn ngữ có 6 nhóm từ × 10 + 10 mẫu câu", () => {
    for (const lang of ["zh", "en"] as const) {
      const cards = CARDS.filter((c) => c.lang === lang);
      const words = cards.filter((c) => c.mode === "recognize");
      const patterns = cards.filter((c) => c.mode === "produce");

      expect(words).toHaveLength(60);
      expect(patterns).toHaveLength(10);

      const groups = new Set(words.map((c) => c.group));
      expect(groups.size).toBe(6);
      for (const group of groups) {
        expect(words.filter((c) => c.group === group)).toHaveLength(10);
      }
    }
  });

  it("thẻ tiếng Trung luôn có pinyin (front) + hanzi (frontAlt)", () => {
    for (const card of CARDS.filter((c) => c.lang === "zh")) {
      expect(card.front.length).toBeGreaterThan(0);
      expect(card.frontAlt).toBeTruthy();
    }
  });

  it("thẻ tiếng Anh không có hanzi (frontAlt = undefined)", () => {
    for (const card of CARDS.filter((c) => c.lang === "en")) {
      expect(card.frontAlt).toBeUndefined();
    }
  });

  it("mọi thẻ có nghĩa (back) không rỗng", () => {
    for (const card of CARDS) {
      expect(card.back.length).toBeGreaterThan(0);
    }
  });
});