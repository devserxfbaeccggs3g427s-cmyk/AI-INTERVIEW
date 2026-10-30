"use client";

/**
 * Icon Material Symbols Outlined.
 *
 * ⚠️ Vì sao dùng `data-icon` + CSS `::before` thay vì `<span>more_vert</span>`:
 * - Material Symbols là font, nên text "more_vert" nằm trong DOM.
 * - `aria-hidden="true"` ẩn nó khỏi cây a11y, NHƯNG axe-core vẫn đối chiếu
 *   text hiển thị với `aria-label` của nút → báo lỗi
 *   `label-content-name-mismatch` (serious).
 * - Render bằng `::before { content: attr(data-icon) }` ⇒ không có text node
 *   trong DOM ⇒ không có mismatch, và icon vẫn hiện đúng.
 */

export interface IconProps {
  /** Tên icon trong Material Symbols Outlined, ví dụ "more_vert". */
  name: string;
  /** Kích thước theo design-system §7.1 — 16 / 18 / 20 / 24px. */
  size?: 16 | 18 | 20 | 22 | 24;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<IconProps["size"]>, string> = {
  16: "text-[16px]",
  18: "text-[18px]",
  20: "text-[20px]",
  22: "text-[22px]",
  24: "text-[24px]",
};

export function Icon({ name, size = 22, className }: IconProps) {
  return (
    <span
      data-icon={name}
      aria-hidden="true"
      className={[
        "material-symbols-outlined",
        SIZE_CLASS[size],
        "leading-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
