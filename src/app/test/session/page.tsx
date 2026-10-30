/**
 * S20 — trang làm bài kiểm tra (task 14.6, 14.7, 14.8, 14.9, 14.10).
 *
 * Server Component — bọc `TestSessionClient` trong `<Suspense>` vì client
 * dùng `useSearchParams()` (bắt buộc có Suspense boundary khi prerender).
 *
 * Xem tasks.md 14.6 / 14.7 / 14.8 / 14.9 · design.md §4.19 / S20.
 */

import { Suspense } from "react";

import { TestSessionClient } from "./_components/TestSessionClient";

export const dynamic = "force-dynamic";

/** Skeleton khi đang tải bài kiểm tra. */
function SessionSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <span className="material-symbols animate-spin">autorenew</span>
      <span className="ml-2">Đang tải bài kiểm tra...</span>
    </div>
  );
}

export default function TestSessionPage() {
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <TestSessionClient />
    </Suspense>
  );
}
