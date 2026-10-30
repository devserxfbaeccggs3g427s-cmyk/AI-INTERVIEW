/**
 * S10 — trang làm server Component, bọc `LanguageSessionClient` trong `<Suspense>`
 * vì client dùng `useSearchParams()` (bắt buộc có Suspense boundary khi prerender).
 *
 * Server Component → Next.js prerender được; Suspense boundary giữ `useSearchParams`
 * (client hook) trong một lớp con client, tránh lỗi build.
 *
 * Xem tasks.md 10.7 · 14.16 · design.md §4.10.
 */

import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { LanguageSessionClient } from "./_components/LanguageSessionClient";

/** Skeleton khi đang tải thẻ SRS. */
function SessionSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <PageHeader
        eyebrow="Ngoại ngữ · SRS"
        title="Đang tải thẻ..."
      />
    </div>
  );
}

export default function LanguageSessionPage() {
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <LanguageSessionClient />
    </Suspense>
  );
}
