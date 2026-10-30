// `cn` import từ `@/lib/cn` (module KHÔNG có "use client") để `DeltaBadge`
// dùng được ở cả Server lân Client Component. Import từ
// `@/components/ui/Button` sẽ biến `cn` thành client-reference và ném lỗi
// "Attempted to call cn() from the server".
import { cn } from "@/lib/cn";

/**
 * `DeltaBadge` — so sánh điểm với lần ghi trước (tasks.md 11.5).
 *
 * Màu sắc (theo ngôn ngữ thiết kế — token, không hardcode hex):
 *   - **Tăng** → `text-primary` + icon `trending_up`
 *   - **Giảm** → `text-error`   + icon `trending_down`
 *   - **Giữ nguyên / chưa có dữ liệu** → `text-outline` + icon `remove`
 *
 * Component này **không** có directive `"use client"` — nó thuần hiển thị,
 * không dùng hook → Server Component dùng được an toàn.
 *
 * Xem tasks.md 11.5 · SPEC.md S07 · design.md §3.3.
 */
export function DeltaBadge({
  current,
  previous,
  label = "So với lần trước",
  className,
}: {
  /** Điểm hiện tại (thang 0–5). */
  current: number;
  /** Điểm lần trước — `null` nghĩa là chưa có dữ liệu để so sánh. */
  previous: number | null;
  /** Nhãn tiền tố — ví dụ "So với lần trước". */
  label?: string;
  className?: string;
}) {
  // Chưa có lần ghi trước → không so sánh được, hiển thị trạng thái trung tính.
  if (previous === null) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 text-body-sm text-outline",
          className,
        )}
      >
        <span className="material-symbols-rounded text-lg" aria-hidden>
          remove
        </span>
        {label}: chưa có dữ liệu
      </span>
    );
  }

  // Làm tròn 1 chữ số thập phân để tránh sai số do điểm là số thực.
  const diff = Math.round((current - previous) * 10) / 10;

  // Giữ nguyên → trung tính, icon `remove`.
  if (diff === 0) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 text-body-sm text-outline",
          className,
        )}
      >
        <span className="material-symbols-rounded text-lg" aria-hidden>
          remove
        </span>
        {label}: {diff.toFixed(1)}
      </span>
    );
  }

  const isPositive = diff > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-body-sm font-medium",
        isPositive ? "text-primary" : "text-error",
        className,
      )}
    >
      <span className="material-symbols-rounded text-lg" aria-hidden>
        {isPositive ? "trending_up" : "trending_down"}
      </span>
      {label}: {isPositive ? "+" : ""}
      {diff.toFixed(1)}
    </span>
  );
}
