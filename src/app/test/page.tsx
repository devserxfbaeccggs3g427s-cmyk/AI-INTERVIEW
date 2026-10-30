/**
 * S19 — placeholder tối giản (tasks.md nhóm 3, task 3.9).
 *
 * Phase 0 chỉ cần nội dung thật cho `/`, `/plan`, `/skills`, `/skills/[id]`,
 * `/log`, `/log/history`, `/state`, `/settings`. Các route còn lại tạm là
 * placeholder 1 trang để:
 *   1. `next build` prerender được (Server Component, không state).
 *   2. Test E2E AC-15 quét 21 route mà không bị 404.
 *
 * **Server Component** — không có directive, không dùng hook.
 *
 * Xem design.md §2.1 (cấu trúc route) · §4.19 · tasks.md 3.9.
 */
import { PageHeader } from "@/components/shell/PageHeader";

export default function TestPage() {
  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Bài kiểm tra · AI-14"
        title="Bài kiểm tra ngoại ngữ"
        description="4 kiểu đề: định vị, theo chủ đề, chuẩn và tự sinh từ nội dung văn bản."
      />
      <p className="text-body-md text-on-surface-variant">Sẽ dựng ở Phase 1.</p>
    </div>
  );
}
