/**
 * Unit test — kho bài tập (tasks.md 11.7).
 *
 * 11.7 Done: *"lưu/nạp prompt"*. Test bảo vệ phần **lưu trữ client-side**:
 *   - Đọc/ghi đúng key `daily-loop-os:prompt-bank:v1`.
 *   - Round-trip: lưu → nạp lại ra đúng danh sách (mới nhất lên đầu).
 *   - Dữ liệu hỏng / thiếu trường → bị bỏ qua, không làm vỡ.
 *
 * Test chỉ đụng 2 hàm thuần (`readPromptBank` / `writePromptBank`) — không
 * render component, không cần DOM.
 *
 * Xem tasks.md 11.7 · SPEC.md S07.
 */

import { describe, expect, it } from "vitest";

import {
  PROMPT_BANK_STORAGE_KEY,
  readPromptBank,
  writePromptBank,
  type SavedPrompt,
} from "@/components/speak/PromptBank";

/** `Storage` giả lập — không cần jsdom cho test này. */
function memoryStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

/** 1 mục kho hợp lệ. */
function savedPrompt(overrides: Partial<SavedPrompt> = {}): SavedPrompt {
  return {
    id: "vi-1",
    text: "Viết email cho sếp xin 2 ngày nghỉ phép",
    level: "B1",
    language: "vi",
    category: "Công việc",
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("kho bài tập — lưu/nạp prompt (11.7)", () => {
  it("storage key đúng định dạng `daily-loop-os:prompt-bank:v1`", () => {
    expect(PROMPT_BANK_STORAGE_KEY).toBe("daily-loop-os:prompt-bank:v1");
  });

  it("kho rỗng → đọc ra mảng rỗng", () => {
    expect(readPromptBank(memoryStorage())).toEqual([]);
  });

  it("lưu rồi nạp lại cho đúng danh sách", () => {
    const storage = memoryStorage();
    const items = [savedPrompt(), savedPrompt({ id: "en-1", text: "Write an email", language: "en" })];

    writePromptBank(items, storage);

    expect(storage.getItem(PROMPT_BANK_STORAGE_KEY)).toBeTruthy();
    expect(readPromptBank(storage)).toEqual(items);
  });

  it("mục mới hơn được xếp lên đầu khi nạp", () => {
    const storage = memoryStorage();
    const older = savedPrompt({ id: "old", savedAt: 1_000 });
    const newer = savedPrompt({ id: "new", savedAt: 2_000 });

    writePromptBank([older, newer], storage);

    expect(readPromptBank(storage).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("JSON hỏng → coi như kho trống, không ném lỗi", () => {
    const storage = memoryStorage({ [PROMPT_BANK_STORAGE_KEY]: "{không phải JSON" });
    expect(readPromptBank(storage)).toEqual([]);
  });

  it("payload không phải mảng → coi như kho trống", () => {
    const storage = memoryStorage({ [PROMPT_BANK_STORAGE_KEY]: '{"a":1}' });
    expect(readPromptBank(storage)).toEqual([]);
  });

  it("mục thiếu trường bắt buộc bị bỏ qua, mục hợp lệ được giữ", () => {
    const storage = memoryStorage({
      [PROMPT_BANK_STORAGE_KEY]: JSON.stringify([
        savedPrompt({ id: "good" }),
        { id: "no-text", level: "B1", language: "vi", category: "X", savedAt: 1 },
        { id: "bad-language", text: "x", level: "B1", language: "fr", category: "X", savedAt: 1 },
        { id: "bad-level", text: "x", level: "C9", language: "vi", category: "X", savedAt: 1 },
        null,
        "không phải object",
      ]),
    });

    const items = readPromptBank(storage);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("good");
  });

  it("ghi đè kho cũ thay vì nối thêm", () => {
    const storage = memoryStorage();
    writePromptBank([savedPrompt({ id: "a" })], storage);
    writePromptBank([savedPrompt({ id: "b" })], storage);

    const items = readPromptBank(storage);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("b");
  });
});
