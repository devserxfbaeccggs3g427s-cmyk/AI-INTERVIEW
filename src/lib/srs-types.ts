/**
 * Kiểu dữ liệu SRS cho **Client Component**.
 *
 * ⚠️ Vì sao tách riêng: `src/lib/srs.ts` import `@/lib/db` (Prisma) ⇒ không
 * import được từ Client Component. File này chỉ chứa type ⇒ an toàn cho
 * browser bundle.
 */

export type SrsLang = "zh" | "en";

export interface SrsCardDTO {
  id: string;
  lang: SrsLang;
  front: string;
  frontAlt: string | null;
  back: string;
  note: string | null;
  example: string | null;
  examplePinyin: string | null;
  hint: string | null;
  group: string | null;
  mode: string;
  due: string;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  mastered: boolean;
  showHint: boolean;
}

export interface SrsProgressDTO {
  lang: SrsLang;
  total: number;
  mastered: number;
  learning: number;
  fresh: number;
  dueToday: number;
  avgRetrievability: number;
  streak: number;
}
