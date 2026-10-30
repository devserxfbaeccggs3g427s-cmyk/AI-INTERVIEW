import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn` — hợp nhất class Tailwind (clsx + tailwind-merge).
 *
 * **Vì sao tách khỏi `components/ui/Button.tsx`?**
 * `Button.tsx` có `"use client"`. Mọi hàm được export từ một module client đều
 * trở thành *client reference* khi được import vào Server Component — gọi trực
 * tiếp sẽ ném lỗi:
 *
 *   "Attempted to call cn() from the server but cn is on the client."
 *
 * Module này **không** có directive nên dùng được ở cả Server lẫn Client
 * Component. `Button.tsx` re-export lại `cn` để các import site cũ
 * (`import { cn } from "@/components/ui/Button"`) không phải sửa.
 *
 * Xem tasks.md 3.6 (UI primitives dùng token) · design.md §2.3.
 */

/**
 * Các token **kích thước chữ** của hệ thiết kế.
 *
 * ⚠️ Bắt buộc phải khai báo cho `tailwind-merge`: mặc định `tailwind-merge`
 * coi **mọi** class `text-*` là "text-color" và class sau sẽ xoá class trước.
 * Hệ quả: `cn("text-headline-lg text-on-surface")` → `"text-on-surface"` —
 * tiêu đề mất hoàn toàn kích thước, rơi về 16px mặc định của `<h1>`.
 * Đây chính là lỗi khiến 21 màn hình không khớp `screen.png`.
 *
 * Định nghĩa đầy đủ: `src/app/globals.css` → `@theme` → `--text-*`.
 */
const TEXT_SIZE_TOKENS = [
  "display",
  "headline-lg",
  "headline-lg-mobile",
  "headline-md",
  "headline-sm",
  "body-lg",
  "body-md",
  "body-sm",
  "code-md",
  "label-md",
  "label-sm",
] as const;

/**
 * Bản `tailwind-merge` đã cấu hình lại:
 *   - Nhóm `font-size` chỉ nhận các token kích thước ở trên → `text-headline-lg`
 *     và `text-on-surface` cùng tồn tại, còn `text-headline-lg` + `text-headline-md`
 *     vẫn loại trừ lẫn nhau đúng như mong đợi.
 *   - Nhóm `text-color` giữ nguyên hành vi mặc định (xoá màu trùng).
 */
const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      "font-size": [{ text: [...TEXT_SIZE_TOKENS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
