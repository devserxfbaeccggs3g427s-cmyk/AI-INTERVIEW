/**
 * S11 — placeholder tối giản (tasks.md nhóm 3, task 3.9).
 *
 * Phase 0 chỉ cần nội dung thật cho `/`, `/plan`, `/skills`, `/skills/[id]`,
 * `/log`, `/log/history`, `/state`, `/settings`. Các route còn lại tạm là
 * placeholder 1 trang để:
 *   1. `next build` prerender được (Server Component, không state).
 *   2. Test E2E AC-15 quét 21 route mà không bị 404.
 *
 * **Server Component** — không có directive, không dùng hook.
 *
 * Xem design.md §2.1 (cấu trúc route) · §4.11 · tasks.md 3.9.
 */
import { PageHeader } from "@/components/shell/PageHeader";

export default function LanguagePracticePage() {
  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Ngoại ngữ · AI-09"
        title="Luyện ngoại ngữ chủ động"
        description="Luyện theo chủ đề: AI sửa lỗi ngữ pháp cục bộ (không gửi dữ liệu ra ngoài)."
      />
      <p className="text-body-md text-on-surface-variant">Sẽ dựng ở Phase 1.</p>
    </div>
  );
}
