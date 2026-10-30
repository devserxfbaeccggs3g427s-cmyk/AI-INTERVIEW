"use client";

/**
 * `PromptBank` — kho bài tập (đề bài) lưu phía **client** (tasks.md 11.7).
 *
 * Người dùng luyện viết/nói cần đề bài *đã lưu* để quay lại luyện tiếp hoặc
 * dùng làm đề mới. Kho này lưu **client-side** trong `localStorage`:
 *   - Key: `daily-loop-os:prompt-bank:v1` (có version → đổi shape sau này an toàn).
 *   - Mỗi mục là 1 `PromptItem` (cùng shape với `SpeakingPractice`) + thời điểm lưu.
 *   - Có thể **xoá** từng mục và **nạp lại** làm đề đang làm.
 *
 * Vì sao không lưu server-side: đề bài là dữ liệu cá nhân, nhẹ, và cần đọc
 * **tức thì** khi mở màn hình — `localStorage` cho độ trễ 0 và không cần
 * thêm API route (FR-CM-01 / SPEC.md S07).
 *
 * Xem tasks.md 11.7 · SPEC.md S07 · design.md §4.7.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import type { PromptItem } from "@/components/speak/SpeakingPractice";

/** Key lưu kho bài tập — có version để đổi shape sau này không phá dữ liệu cũ. */
export const PROMPT_BANK_STORAGE_KEY = "daily-loop-os:prompt-bank:v1";

/** Một mục trong kho — `PromptItem` + thời điểm lưu (để sắp xếp & hiển thị). */
export type SavedPrompt = PromptItem & {
  /** Epoch ms — lúc người dùng bấm "Lưu đề hiện tại". */
  savedAt: number;
};

/**
 * Đọc kho từ `localStorage`.
 *
 * - Trả `[]` nếu chưa có gì / JSON hỏng / `localStorage` bị chặn (private mode).
 * - Chỉ nhận mục có **đủ** 5 trường của `PromptItem` → dữ liệu hỏng bị bỏ qua
 *   thay vì làm vỡ render.
 */
export function readPromptBank(storage?: Storage): SavedPrompt[] {
  const store = storage ?? safeLocalStorage();
  if (!store) return [];

  try {
    const raw = store.getItem(PROMPT_BANK_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: SavedPrompt[] = [];
    for (const item of parsed) {
      if (isSavedPrompt(item)) out.push(item);
    }
    // Mới nhất lên đầu.
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    // JSON hỏng → coi như kho trống.
    return [];
  }
}

/** Ghi kho xuống `localStorage` — bỏ qua nếu bị chặn (private mode). */
export function writePromptBank(items: SavedPrompt[], storage?: Storage): void {
  const store = storage ?? safeLocalStorage();
  if (!store) return;
  try {
    store.setItem(PROMPT_BANK_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Hết quota / bị chặn → không chặn luồng chính.
  }
}

/** Lấy `localStorage` an toàn (SSR / private mode / sandbox iframe). */
function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** CEFR level hợp lệ — phải khớp `CEFRLevel` trong `SpeakingPractice`. */
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;

/**
 * Kiểm tra 1 mục trong kho có đủ & đúng trường `PromptItem` không.
 *
 * Kiểm tra **cả giá trị** (level / language), không chỉ kiểu — dữ liệu hỏng
 * phải bị loại bỏ chứ không được lách qua và làm hỏng type của `PromptItem`.
 */
function isSavedPrompt(value: unknown): value is SavedPrompt {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.level === "string" &&
    (CEFR_LEVELS as readonly string[]).includes(v.level) &&
    (v.language === "vi" || v.language === "en" || v.language === "zh") &&
    typeof v.category === "string" &&
    typeof v.savedAt === "number"
  );
}

/**
 * Khoá nhận diện 1 đề — dùng để chống lưu trùng.
 *
 * So khớp theo **nội dung đề + ngôn ngữ** (không theo `id`) vì đề từ ngân
 * hàng và đề tự tạo đều có `id` khác nhau mỗi lần (`custom-${Date.now()}`).
 */
function promptKey(prompt: PromptItem): string {
  return `${prompt.language}::${prompt.text.trim().toLowerCase()}`;
}

/** Khoá duy nhất cho 1 mục đã lưu. */
function savedKey(item: SavedPrompt): string {
  return promptKey(item);
}

/**
 * `PromptBank` — UI quản lý kho bài tập.
 *
 * Dùng ở S07 (`/speak/write`) và S08 (`/speak/talk`):
 *   - Nút "Lưu đề hiện tại" → lưu `prompt` đang làm vào kho.
 *   - Bấm 1 mục trong danh sách → `onUsePrompt(item)` để nạp làm đề mới.
 *   - Nút "Xoá" → gỡ mục khỏi kho.
 */
export function PromptBank({
  prompt,
  onUsePrompt,
  className,
}: {
  /** Đề bài hiện tại — dùng cho nút "Lưu đề hiện tại". */
  prompt: PromptItem;
  /** Gọi khi người dùng bấm 1 mục trong kho → nạp đề đó vào editor. */
  onUsePrompt: (prompt: PromptItem) => void;
  className?: string;
}) {
  const [items, setItems] = useState<SavedPrompt[]>([]);
  const [ready, setReady] = useState(false);

  // Đọc kho sau khi mount — `localStorage` chỉ tồn tại phía client.
  useEffect(() => {
    setItems(readPromptBank());
    setReady(true);
  }, []);

  const persist = useCallback((next: SavedPrompt[]) => {
    setItems(next);
    writePromptBank(next);
  }, []);

  const handleSave = useCallback(() => {
    const key = promptKey(prompt);
    // Đề đã có trong kho → không lưu lại (tránh trùng).
    if (items.some((item) => savedKey(item) === key)) return;

    const next: SavedPrompt[] = [{ ...prompt, savedAt: Date.now() }, ...items];
    persist(next);
  }, [items, persist, prompt]);

  const handleRemove = useCallback(
    (target: SavedPrompt) => {
      // Xoá theo **khoá đề** (ngôn ngữ + nội dung) — cùng khoá với chống trùng,
      // nên xoá đúng mục đang hiển thị kể cả khi `id` trùng do đề tự tạo.
      const key = savedKey(target);
      persist(items.filter((item) => savedKey(item) !== key));
    },
    [items, persist],
  );

  const handleUse = useCallback(
    (item: SavedPrompt) => {
      onUsePrompt({
        id: item.id,
        text: item.text,
        level: item.level,
        language: item.language,
        category: item.category,
      });
    },
    [onUsePrompt],
  );

  const alreadySaved = items.some((item) => savedKey(item) === promptKey(prompt));

  return (
    <section
      className={cn(
        "rounded-xl border border-outline-variant/40 bg-surface-container-low p-gutter-md space-y-gutter-sm",
        className,
      )}
      aria-label="Kho bài tập"
    >
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex items-center gap-gutter-sm min-w-0">
          <span className="material-symbols-rounded text-primary" aria-hidden>
            inventory_2
          </span>
          <h3 className="font-headline-sm text-on-surface">Kho bài tập</h3>
          <Chip tone="outline">{items.length} đề</Chip>
        </div>
        <Button
          variant={alreadySaved ? "ghost" : "secondary"}
          size="sm"
          onClick={handleSave}
          icon={alreadySaved ? "check" : "bookmark_add"}
          disabled={alreadySaved}
        >
          {alreadySaved ? "Đã lưu đề này" : "Lưu đề hiện tại"}
        </Button>
      </div>

      {!ready ? (
        <p className="text-body-sm text-on-surface-variant">Đang tải kho bài tập…</p>
      ) : items.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">
          Chưa có đề nào được lưu. Bấm “Lưu đề hiện tại” để lưu đề đang luyện vào kho.
        </p>
      ) : (
        <ul className="space-y-gutter-xs">
          {items.map((item) => (
            <li
              key={savedKey(item)}
              className="flex flex-wrap items-center gap-gutter-sm rounded-lg border border-outline-variant/40 bg-surface-container px-gutter-sm py-gutter-xs"
            >
              <button
                type="button"
                onClick={() => handleUse(item)}
                className="flex-1 min-w-0 text-left group"
                title="Nạp đề này làm đề mới"
              >
                <span className="block text-body-md text-on-surface group-hover:text-primary line-clamp-2">
                  {item.text}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-space-sm">
                  <Chip tone="primary">{item.level}</Chip>
                  <Chip tone="neutral">{item.category}</Chip>
                  <Chip tone="outline">{item.language.toUpperCase()}</Chip>
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(item)}
                icon="delete"
                aria-label={`Xoá đề: ${item.text}`}
              >
                Xoá
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
