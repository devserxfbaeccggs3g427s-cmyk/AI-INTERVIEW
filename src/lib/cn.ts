/**
 * Gộp class Tailwind — giải quyết xung đột class theo thứ tự nguồn.
 * Cài đặt: không thêm dependency (clsx + tailwind-merge) — chỉ cần 1 helper nhỏ.
 */

/** Gộp chuỗi class, loại bỏ falsy. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
