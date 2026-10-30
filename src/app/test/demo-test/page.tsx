/**
 * S21 (demo) — placeholder tối giản (tasks.md nhóm 3, task 3.9).
 *
 * Phase 0 chỉ cần nội dung thật cho `/`, `/plan`, `/skills`, `/skills/[id]`,
 * `/log`, `/log/history`, `/state`, `/settings`. Các route còn lại tạm là
 * placeholder 1 trang để:
 *   1. `next build` prerender được (Server Component, không state).
 *   2. Test E2E AC-15 quét 21 route mà không bị 404.
 *
 * **Server Component** — không có directive, không dùng hook.
 *
 * Xem design.md §2.1 (cấu trúc route) · §4.21 · tasks.md 3.9.
 */
import { PageHeader } from "@/components/shell/PageHeader";

export default function TestDemoTestPage() {
  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Bài kiểm tra · AI-16"
        title="Kết quả bài kiểm tra"
        description="Tổng điểm, biểu đồ radar 6 trục, thẻ bị đẩy về ôn và danh sách câu sai."
      />
      <p className="text-body-md text-on-surface-variant">Sẽ dựng ở Phase 1.</p>
    </div>
  );
}
