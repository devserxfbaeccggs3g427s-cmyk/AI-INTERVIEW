"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import type { ReactNode } from "react";

/**
 * Bọc `PageHeader` trong 1 ranh giới client.
 *
 * Vì sao cần: `PageHeader` gọi `cn()` — hàm nằm ở `src/components/ui/Button.tsx`
 * (file có `"use client"`). Next.js chặn Server Component gọi hàm của client
 * module → runtime 500 "Attempted to call cn() from the server". Khi 1 module
 * **không** có `"use client"` được import từ 1 module **có** `"use client"`, nó
 * vẫn nằm trong client bundle → gọi `cn()` lúc render client là hợp lệ.
 *
 * Nhờ vậy `src/app/page.tsx` (Server Component) vẫn render được header mà không
 * phụ thuộc vào việc agent khác thêm `"use client"` vào `PageHeader`.
 *
 * Xem tasks.md 4.1 · design.md §4.1.
 */
export function DailyLoopHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
  );
}
