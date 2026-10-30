import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

/**
 * `Skeleton` — khối xám nhấp nháy trong lúc chờ dữ liệu.
 *
 * Chỉ dùng token Tailwind (`bg-surface-container-highest`), **không** màu hex.
 * `animate-pulse` đã có sẵn trong Tailwind nên không cần khai báo keyframes riêng.
 *
 * **Server-safe**: không có directive → dùng được ở cả Server lẫn Client.
 *
 * Xem tasks.md 3.6 · NFR-06 (trạng thái chờ phải thông báo được, không trắng trơn).
 */
export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Dạng khối. */
  variant?: "text" | "block" | "circle";
};

const VARIANTS = {
  text: "h-3 w-full rounded-sm",
  block: "h-24 w-full rounded-xl",
  circle: "h-10 w-10 rounded-[9999px]",
} as const;

export function Skeleton({ variant = "text", className, ...rest }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse bg-surface-container-highest", VARIANTS[variant], className)}
      aria-hidden
      {...rest}
    />
  );
}

/**
 * Nhiều dòng skeleton — tiện cho vùng "danh sách chưa tải xong".
 *
 * `count` dòng, mỗi dòng ngắn hơn dòng trước một chút để trông tự nhiên hơn
 * (pattern quen thuộc của skeleton list).
 */
export function SkeletonText({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-space-sm", className)} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          className={index === count - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}
