/**
 * Hằng số dạng câu hỏi — **client-safe** (KHÔNG import `prisma`).
 *
 * Tách riêng khỏi `test-gen.ts` vì `test-gen.ts` chạy server-only (truy vấn DB),
 * còn các component client như `BenchmarkChart` / `ResultRadar` chỉ cần nhãn
 * dạng câu để vẽ biểu đồ.
 *
 * Xem tasks.md 14.3 / 14.15 · design.md §4.19.
 */

/** 6 dạng câu hỏi — khớp `TestItem.itemType` trong schema. */
export const ITEM_TYPES = [
  "mc_vocab",
  "mc_grammar",
  "cloze",
  "listening",
  "writing",
  "translation",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

/** Nhãn tiếng Việt của từng dạng câu — dùng cho UI + nhóm kết quả. */
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  mc_vocab: "Từ vựng (MC)",
  mc_grammar: "Ngữ pháp (MC)",
  cloze: "Điền từ",
  listening: "Nghe",
  writing: "Viết",
  translation: "Dịch",
};

/** Dạng câu chấm được **tự động** (task 14.10) — không cần AI. */
export const AUTO_GRADED_TYPES: readonly ItemType[] = [
  "mc_vocab",
  "mc_grammar",
  "cloze",
  "listening",
];

/** Dạng câu cần AI chấm (task 14.11). */
export const AI_GRADED_TYPES: readonly ItemType[] = ["writing", "translation"];
