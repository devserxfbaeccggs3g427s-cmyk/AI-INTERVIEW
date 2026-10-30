/**
 * DTO + helper dùng chung cho S06 — Nhật ký & phản hồi AI (tasks.md 12.1–12.7).
 *
 * File này **không** import Prisma và không có directive → dùng được cho cả
 * Server Component, Client Component lẫn route handler.
 *
 * Vì sao tách riêng:
 *   - `JournalEditor` (client) cần hằng số giới hạn + hàm chèn gợi ý.
 *   - Route handler `/api/journal/*` cần cùng bộ giới hạn để **validate độ
 *     dài** phản hồi AI (AI-05 tuyệt đối không được trả lời dài).
 *   - `JournalHistory` (client) cần kiểu dữ liệu entry đã join `Reflection`.
 *
 * Xem tasks.md 12.1–12.7 · design.md §4.6 · requirements.md US-04.
 */

import { type Domain } from "@/lib/types";

/**
 * Key lưu bản nháp nhật ký trong `localStorage`.
 *
 * Đặc tả AC-14 quy định đúng key này — đổi key là mất toàn bộ bản nháp cũ.
 */
export const JOURNAL_DRAFT_KEY = "daily-loop-os:journal-draft:v1";

/** Giới hạn ký tự của 1 entry nhật ký. */
export const JOURNAL_MAX_LENGTH = 2000;

/** Giới hạn ký tự của phần "tóm tắt" (AI-05). */
export const JOURNAL_MAX_SUMMARY_CHARS = 240;

/** Giới hạn ký tự của phần "câu hỏi sắc" (AI-05). */
export const JOURNAL_MAX_QUESTION_CHARS = 280;

/** Ngữ cảnh của 1 gợi ý câu hỏi mở (task 12.2). */
export type JournalPromptContext = "after_lesson" | "end_of_day" | "weekend";

export type JournalPromptSuggestion = {
  /** Khoá ổn định — dùng làm `data-testid` + phân biệt gợi ý. */
  id: JournalPromptContext;
  /** Nhãn ngắn hiển thị trên nút. */
  label: string;
  /** Icon Material Symbols Outlined. */
  icon: string;
  /** Câu hỏi mở — được **chèn vào cuối** nội dung hiện tại. */
  prompt: string;
};

/**
 * 3 gợi ý câu hỏi đào sâu theo ngữ cảnh (task 12.2).
 *
 * Bấm 1 gợi ý → chèn vào **cuối** nội dung đang có, KHÔNG ghi đè (hàm
 * `appendPrompt` bên dưới).
 */
export const JOURNAL_PROMPT_SUGGESTIONS: readonly JournalPromptSuggestion[] = [
  {
    id: "after_lesson",
    label: "Sau buổi học",
    icon: "lightbulb",
    prompt: "Sau buổi học: Điều gì khiến bạn bất ngờ nhất hôm nay?",
  },
  {
    id: "end_of_day",
    label: "Cuối ngày",
    icon: "track_changes",
    prompt: "Cuối ngày: Lý do gì khiến bạn chưa dứt điểm hết 6 hành động?",
  },
  {
    id: "weekend",
    label: "Cuối tuần",
    icon: "balance",
    prompt: "Cuối tuần: Bạn đã nói “Không” với điều gì để giữ tập trung?",
  },
];

/**
 * Chèn 1 gợi ý vào **cuối** nội dung hiện tại — không ghi đè (task 12.2).
 *
 * Nội dung cũ được `trimEnd()` trước nên không dính dòng trống thừa; giữa 2
 * đoạn chèn 1 dòng trống để Markdown tách đoạn rõ ràng.
 */
export function appendPrompt(content: string, prompt: string): string {
  const base = content.trimEnd();
  return base ? `${base}\n\n${prompt}` : prompt;
}

/**
 * Ép 1 đoạn văn thành **đúng 1 câu** và giới hạn độ dài (task 12.3).
 *
 * AI-05 phải trả về "1 câu tóm tắt" + "1 câu hỏi sắc" — tuyệt đối không trả
 * lời dài. Prompt đã yêu cầu, nhưng ta **vẫn validate ở server**: nếu model
 * trả về nhiều câu hoặc 1 câu quá dài thì cắt còn 1 câu đầu rồi cắt theo độ
 * dài. Người dùng **luôn** chỉ thấy 1 câu ngắn.
 */
export function clampToSingleSentence(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  // Cắt ở dấu kết thúc câu đầu tiên (`.` `!` `?`).
  const first = clean.match(/^[^.!?]*[.!?]?/)?.[0]?.trim() ?? "";
  const sentence = first.length > 0 ? first : clean;

  if (sentence.length <= maxChars) return sentence;
  return `${sentence.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/** Nhãn provider + model — **không hardcode**, dựng từ `AiCallMeta` (task 12.5). */
export function providerModelLabel(meta: {
  provider: "local" | "anthropic";
  model: string;
}): string {
  const provider = meta.provider === "local" ? "Local" : "Cloud";
  return `${provider} · ${meta.model}`;
}

/** Phản hồi AI-05 đã chuẩn hoá (1 tóm tắt + 1 câu hỏi sắc). */
export type JournalFeedback = {
  summary: string;
  sharpQuestion: string;
};

/** Kết quả AI-06 — phân loại domain/skill + confidence. */
export type JournalClassifyResult = {
  domain: Domain;
  skillName: string | null;
  /** Skill đã resolve từ `skillName` (null nếu không khớp cây kỹ năng). */
  skillId: string | null;
  /** 0–100 (98 = 98%). */
  confidence: number;
};

/**
 * Serialize phản hồi AI để lưu vào `Reflection.aiFeedback`.
 *
 * Lưu JSON để `JournalHistory` hiển thị tách riêng "tóm tắt" và "câu hỏi
 * sắc"; `parseAiFeedback` fallback về text thuần nếu dữ liệu cũ không phải
 * JSON.
 */
export function formatAiFeedback(feedback: JournalFeedback): string {
  return JSON.stringify({ summary: feedback.summary, sharpQuestion: feedback.sharpQuestion });
}

/** Đọc lại `Reflection.aiFeedback` — luôn trả về cấu trúc để render. */
export function parseAiFeedback(raw: string | null | undefined): JournalFeedback | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<JournalFeedback>;
    if (typeof parsed.summary === "string" && typeof parsed.sharpQuestion === "string") {
      return { summary: parsed.summary, sharpQuestion: parsed.sharpQuestion };
    }
  } catch {
    // Không phải JSON → coi như text thuần (dữ liệu cũ / nhập tay).
  }
  return { summary: raw, sharpQuestion: "" };
}

/** 1 entry nhật ký — đã join `Reflection` + `Activity` (task 12.6). */
export type JournalEntryDTO = {
  /** Id của `Reflection` (khóa chính của entry). */
  id: string;
  /** Id của `Activity` liên quan 1-1. */
  activityId: string;
  title: string;
  /** Câu hỏi gợi ý đã dùng khi viết entry (nếu có). */
  prompt: string;
  /** Nội dung người dùng đã viết (`Reflection.answer`). */
  answer: string;
  /** Ghi chú AI đã serialize (`Reflection.aiFeedback`). */
  aiFeedback: string | null;
  domain: Domain;
  skillName: string | null;
  createdAt: string;
};

/** Bản nháp lưu trong `localStorage`. */
export type JournalDraft = {
  content: string;
  updatedAt: number;
};

/**
 * Đọc bản nháp từ `localStorage`.
 *
 * Trả `null` nếu chưa có bản nháp / bản nháp hỏng / storage bị chặn
 * (private mode) — caller coi như "chưa có gì để khôi phục".
 */
export function readJournalDraft(storage: Storage | null | undefined): JournalDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(JOURNAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JournalDraft>;
    if (typeof parsed.content !== "string") return null;
    return {
      content: parsed.content,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Ghi bản nháp — nuốt lỗi (storage bị chặn) để không chặn luồng viết. */
export function writeJournalDraft(
  storage: Storage | null | undefined,
  content: string,
  updatedAt: number,
): void {
  if (!storage) return;
  try {
    storage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify({ content, updatedAt }));
  } catch {
    // localStorage bị chặn (private mode / quota) → bỏ qua.
  }
}

/** Xoá bản nháp sau khi đã lưu entry thật. */
export function clearJournalDraft(storage: Storage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(JOURNAL_DRAFT_KEY);
  } catch {
    // Bỏ qua.
  }
}
